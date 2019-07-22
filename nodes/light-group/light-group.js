const serialise = require('../../common/serialise');
const _ = require('lodash');

module.exports = function (RED) {
  'use strict';

  function IkeaLightGroupNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.connection = false;
    node.groupReachable = true; //is the light reachable by the gateway ? ( for instance when power switched off by wall switch)
    node.gatewayReachable = true; // is the gateway reachable? ( for instance when coap client can't (temporarily) talk to gateway )
    node.interval = null;
    node.lastMessageReceived = {};
    node.direction = 1;
    node.retMsg = null;
    node.group = null;
    node.spectrumLight = null;

    // set initial state of this node
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.server.getConnection.then(
      _ => node.onConnected(),
      _ => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log("group error: ",err));

    node.onConnected = function(){
      node.gatewayReachable = node.server.gatewayReachable;
      node.status({fill: 'green', shape: 'ring', text: 'Connected to gateway'});
      node.server.registerListener(node.server.types.GROUP,config.groupId,node.id, node.registeredCallback);
      node.group = node.server.getGroup(config.groupId);

      if (config.detectAlive) {
        node.spectrumLight = node.server.getAccessory(config.spectrumLightId).lightList[0];
        node.aliveCheckLoop();
      }

      node.on("input", (msg) => {

        if (_.get(msg, 'payload.cmd') === undefined) {
          return; // do nothing unless we have a cmd
        }

        node.retMsg = null;

        if (node.groupReachable && node.gatewayReachable) {
          node.doAction(msg);
        }else if (_.get(msg, 'payload.cmd') === "GETSTATUS"){
          node.doAction(msg);
        }

        if (node.retMsg !== null) node.send([node.retMsg]);
      });

      node.on("close", function(removed, done) {
        clearInterval(node.aliveCheckinterval);
        node.server.unregisterListener(node.server.types.GROUP,config.groupId,node.id);
        done();
      });
    };

    node.doAction = function(msg){
      let action = msg.payload.cmd.toUpperCase()
      node.retMsg = null;
      let runAction = {
        "GETSTATUS" : _ => node.retMsg = {"payload": {"status": serialise.basicGroup(node.server.getGroup(config.groupId))}},
        "TOGGLE" : _ => node.group.toggle().catch((err) => console.log("error toggling ", err)),
        "ON" : _ => node.group.turnOn().then(_ => console.log("was turned on")).catch((err) => console.log("err ", err)),
        "OFF" : _ => node.group.turnOff().then(_ => console.log("was turned off")).catch((err) => console.log("err ", err)),
        "SETCOLORTEMPERATURE": _ => node.group.setColorTemperature(60).then(_ => console.log("colortemp set to 60")).catch((err) => console.log("err ", err)),
        "default": _ => {/* do nothing */}
      };
      return (runAction[action] || runAction['default'])();
    };

    node.aliveCheckLoop = function(){
      let secondsInterval = 20000 + ((Math.floor(Math.random() * 20) + 1 ) * 1000); // random between 20 and 40 seconds.
      node.aliveCheckinterval = setInterval(() => {
          if (node.groupReachable) {
            node.debuglog("in the aliveCheckLoop every "+ secondsInterval/1000 + " seconds");
            // increase and decrease colortemp continuously to detect an alive = false situation.
            node.spectrumLight.setColorTemperature(node.spectrumLight.colorTemperature + node.direction).then(_=>{}).catch((err)=>console.log("caught checkloop error ",err));
            node.direction *= -1;
          }
        },secondsInterval
      );
    };

    node.registeredCallback = function(message) {
      let actions = {
        "status": function(message) {
          let groupObject = serialise.basicGroup(message.content);

          console.log(message.content.alive)

          //if (!_.isEqualWith(node.lastMessageReceived, groupObject, serialise.lightColorTempComparator)) {
            let stateColor = message.content.alive != undefined && !message.content.alive ? "red" : message.content.onOff ? "green" : "grey";
            node.status({
              fill: stateColor,
              shape: 'ring',
              text: 'Group is ' + (stateColor === "red" ? "not powered" : stateColor === "green" ? "on" : "off")
            });
            node.send([{"payload": groupObject}]);
          //}
          node.groupReachable = message.content.alive;
          node.lastMessageReceived = groupObject;
        },
        "connectivity": function(message){
          if (config.detectAlive) {
            if (!message.content.gatewayReachable) {
              clearInterval(node.aliveCheckinterval)
            }else {
              node.lastMessageReceived = {};
              node.groupReachable = true;
              node.aliveCheckLoop();
            }
          }
          let statusObject = message.content.gatewayReachable?{text: "Connected to gateway",fill: "green", shape: "ring"}:{text: "Disconnected from gateway",fill: "red", shape: "ring" };
          node.status(statusObject);
        }
      };
      actions[message.type](message);

    };
  }
  RED.nodes.registerType('ikea-light-group', IkeaLightGroupNode);
};
