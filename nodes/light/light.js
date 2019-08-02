const serialise = require('../../common/serialise');
const _ = require('lodash');

module.exports = function (RED) {
  'use strict';

  function IkeaLightNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.connection = false;
    node.lightReachable = true; //is the light reachable by the gateway ? ( for instance when power switched off by wall switch)
    node.gatewayReachable = true; // is the gateway reachable? ( for instance when coap client can't (temporarily) talk to gateway )
    node.interval = null;
    node.lastMessageReceived = {};
    node.direction = 1;
    node.retMsg = null;
    node.light = null;

    // set initial state of this node
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.server.getConnection.then(
      _ => node.onConnected(),
      _ => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log("light error: ",err));

    node.onConnected = function(){
      node.gatewayReachable = node.server.gatewayReachable;
      node.status({fill: 'green', shape: 'ring', text: 'Connected to gateway'});
      node.server.registerListener(node.server.types.ACCESSORY,config.deviceId,node.id, node.registeredCallback);

      if (config.detectAlive) {
        node.aliveCheckLoop();
      }
      node.on("input", (msg) => {
        if (_.get(msg, 'payload.cmd') === undefined) {
          return; // do nothing unless we have a cmd
        }

        node.retMsg = null;
        node.light = node.server.getAccessory(config.deviceId).lightList[0];

        if (node.lightReachable && node.gatewayReachable) {
          node.doAction(msg);
        }else if (_.get(msg, 'payload.cmd') === "GETSTATUS"){
          node.doAction(msg);
        }

        if (node.retMsg !== null) node.send([node.retMsg]);
      });

      node.on("close", function(removed, done) {
        clearInterval(node.aliveCheckinterval);
        node.server.unregisterListener(node.server.types.ACCESSORY,config.deviceId,node.id);
        done();
      });
    };

    node.doAction = function(msg){
      let action = msg.payload.cmd.toUpperCase()
      node.retMsg = null;
      let runAction = {
        "GETSTATUS" : _ => node.retMsg = {"payload": {"status": serialise.lightFromAccessory(node.server.getAccessory(config.deviceId))}} ,
        "TOGGLE" : _ => node.light.toggle().catch((err) => console.log("error toggling ", err)),
        "TURNON" : _ => node.light.turnOn().catch((err) => console.log("err ", err)),
        "TURNOFF" : _ => node.light.turnOff().catch((err) => console.log("err ", err)),
        "SETPROPERTIES": (payload) => {
          if (payload.hasOwnProperty("properties") && typeof payload.properties === 'object') {
            try {
              let lightOperation = serialise.lightOperation(payload.properties);
              node.server.tradfri.operateLight(node.server.getAccessory(config.deviceId),groupOperation);
            } catch (err){
              node.debuglog("Could not apply the light properties. Please make sure the properties are valid. Error: "+err.message,"warn");
            }
          }
        },
        "default": _ => {/* do nothing */}
      };;
      return (runAction[action] || runAction['default'])(msg.payload);
    };

    node.aliveCheckLoop = function(){
      let secondsInterval = 20000 + ((Math.floor(Math.random() * 20) + 1 ) * 1000); // random between 20 and 40 seconds.
      node.aliveCheckinterval = setInterval(() => {
        let light = node.server.getAccessory(config.deviceId);

        if (node.lightReachable) {
          node.debuglog("in the aliveCheckLoop every "+ secondsInterval/1000 + " seconds");
          // increase and decrease colortemp continuously to detect an alive = false situation.
          if (light.lightList[0].spectrum == "none") {
            //doesnt work for no-spectrum lights unfortunately
            node.server.tradfri.operateLight(light,{"transitionTime":light.lightList[0].transitionTime + node.direction});
          }else{
            light.lightList[0].setColorTemperature(light.lightList[0].colorTemperature + node.direction).then(_ => {
            }).catch((err) => console.log("caught checkloop error ", err));
          }
          node.direction *= -1;
        }
      },secondsInterval
      );
    };

    node.registeredCallback = function(message) {
      let actions = {
        "status": function(message) {
          let lightObject = serialise.lightFromAccessory(message.content);
          if (!_.isEqualWith(node.lastMessageReceived, lightObject, serialise.lightColorTempComparator)) {
            let stateColor = !message.content.alive ? "red" : message.content.lightList[0].onOff ? "green" : "grey";
            node.status({
              fill: stateColor,
              shape: 'ring',
              text: 'Light is ' + (stateColor === "red" ? "not powered" : stateColor === "green" ? "on" : "off")
            });
            node.send([{"payload": lightObject}]);
          }
          node.lightReachable = message.content.alive;
          node.lastMessageReceived = lightObject;
        },
        "connectivity": function(message){
          if (config.detectAlive) {
             if (!message.content.gatewayReachable) {
               clearInterval(node.aliveCheckinterval)
             }else {
               node.lastMessageReceived = {};
               node.lightReachable = true;
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
  RED.nodes.registerType('ikea-light', IkeaLightNode);
};
