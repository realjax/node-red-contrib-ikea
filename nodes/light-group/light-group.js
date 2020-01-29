const serialise = require('../../common/serialise');
const _ = require('lodash');

module.exports = function (RED) {
  'use strict';

  function IkeaLightGroupNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.connection = false;
    node.groupReachable = true; //is the group reachable by the gateway ? ( for instance when power switched off by wall switch)
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
    ).catch((err) => node.debuglog(err.message,"error"));

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
        }else if (_.get(msg, 'payload.cmd').toUpperCase() === "GETSTATUS" || _.get(msg, 'payload.cmd').toUpperCase() === "TEST") {
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
        "TOGGLE" : _ => node.customToggle(),
        "TURNON" : _ => node.group.turnOn().catch((err) => node.debuglog(err.message,"error")),
        "TURNOFF" : _ => node.group.turnOff().catch((err) => node.debuglog(err.message,"error")),
        "SETPROPERTIES": function (payload) {
          if (payload.hasOwnProperty("properties") && typeof payload.properties === 'object') {
            try {
              let groupOperation = serialise.grouopOperation(payload.properties);
              node.server.tradfri.operateGrouo(node.server.getGroup(config.groupId),groupOperation);
            } catch (err){
              node.debuglog("Could not apply the group properties. Please make sure the properties are valid. Error: "+err.message,"error");
            }
          }
        },

       // "TEST" : _ => console.log("debounced: ",node.server.getDebouncedGroupMessage(node.server.groups[config.groupId])),
        "default": _ => {/* do nothing */}
      };
      return (runAction[action] || runAction['default'])(msg.payload);
    };

    node.customToggle = function(){
      let currentState = serialise.basicGroup(node.server.getGroup(config.groupId)).onOff;
      node.group.toggle(!currentState).catch((err) => node.debuglog(err.message,"error"))
    }

    node.aliveCheckLoop = function(){
      let secondsInterval = 20000 + ((Math.floor(Math.random() * 20) + 1 ) * 1000); // random between 20 and 40 seconds.
      node.aliveCheckinterval = setInterval(() => {
          if (node.groupReachable) {
            node.debuglog("in the aliveCheckLoop every "+ secondsInterval/1000 + " seconds");
            // increase and decrease colortemp continuously to detect an alive = false situation.
            node.spectrumLight.setColorTemperature(node.spectrumLight.colorTemperature + node.direction).then(_=>{}).catch((err)=>node.debuglog("caught checkloop error " +err.message,"error"));
            node.direction *= -1;
          }
        },secondsInterval
      );
    };

    node.registeredCallback = function(message) {
      let actions = {
        "status": function(message) {
          let groupObject = serialise.basicGroup(message.content);

          if (!_.isEqualWith(node.lastMessageReceived, groupObject)) {
            let stateColor = message.content.alive != undefined && !message.content.alive ? "red" : message.content.onOff ? "green" : "grey";
            node.status({
              fill: stateColor,
              shape: 'ring',
              text: 'Group is ' + (stateColor === "red" ? "not powered" : stateColor === "green" ? "on" : "off")
            });
            node.send([{"payload": groupObject}]);
          }
          node.groupReachable = message.content.alive ;
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
        },
        "remove": function(message){
          if (config.groupId == message.content.instanceId){
            node.groupReachable = false;
            node.gatewayReachable = false;
            clearInterval(node.aliveCheckinterval);
            node.status({fill: 'red', shape: 'ring', text: 'group deleted, please reconfigure'});
          }else if(node.spectrumLight.instanceId == message.content.instanceId){
            clearInterval(node.aliveCheckinterval);
          }
          if (_.indexOf(node.group.deviceIds,message.content.instanceId) > -1){

          }
        }
      };
      actions[message.type](message);

    };
  }
  RED.nodes.registerType('ikea-light-group', IkeaLightGroupNode);
};
//TODO: implement group removed