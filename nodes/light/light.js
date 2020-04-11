const serialise = require('../../common/serialise');
const _ = require('lodash');

module.exports = function (RED) {
  'use strict';

  function IkeaLightNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.lightReachable = true; //is the light reachable by the gateway ? ( for instance when power switched off by wall switch)
    node.gatewayReachable = true; // is the gateway reachable? ( for instance when coap client can't (temporarily) talk to gateway )
    node.intervalLowerLimitSeconds = 20;
    node.intervalUpperLimitSeconds = 40;
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
    ).catch((err) => node.debuglog(err.message,"error"));

    node.onConnected = function(){
      node.gatewayReachable = node.server.gatewayReachable;
      node.status({fill: 'green', shape: 'ring', text: 'Connected to gateway'});
      node.server.registerListener(node.server.types.ACCESSORY,config.deviceId,node.id, node.registeredCallback);


      node.light = node.server.getAccessory(config.deviceId);

      //show current state for node
      let stateColor = !node.light.alive ? "red" : node.light.lightList[0].onOff ? "green" : "grey";
      node.status({
        fill: stateColor,
        shape: 'ring',
        text: 'Light is ' + (stateColor === "red" ? "not powered" : stateColor === "green" ? "on" : "off")
      });

      if (config.detectAlive) {
        node.aliveCheckLoop();
      }


      node.on("input", (msg) => {
        if (_.get(msg, 'payload.cmd') === undefined) {
          return; // do nothing unless we have a cmd
        }

        node.retMsg = null;


        if (node.lightReachable && node.gatewayReachable) {
          node.doAction(msg);
        }else if (_.get(msg, 'payload.cmd').toUpperCase() === "GETSTATUS"){
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
        "GETSTATUS" : _ => node.retMsg = {"payload": {"status": serialise.lightFromAccessory(node.server.getAccessory(config.deviceId))}},
        "TOGGLE" : _ => node.light.lightList[0].toggle().catch((err) => node.debuglog(err.message,"error")),
        "TURNON" :_ => node.server.tradfri.operateLight(node.server.getAccessory(config.deviceId),{onOff:true},true).catch((err) => node.debuglog(err.message,"error")),
        "TURNOFF" : _ => node.server.tradfri.operateLight(node.server.getAccessory(config.deviceId),{onOff:false},true).catch((err) => node.debuglog(err.message,"error")),
        "SETPROPERTIES": (payload) => {
          if (payload.hasOwnProperty("properties") && typeof payload.properties === 'object') {
            try {
              let lightOperation = serialise.lightOperation(payload.properties);
              node.server.tradfri.operateLight(node.server.getAccessory(config.deviceId),lightOperation,true);
            } catch (err){
              node.debuglog("Could not apply the light properties. Please make sure the properties are valid. Error: "+err.message,"error");
            }
          }
        },
        "default": _ => {}
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
          if (light.lightList[0].spectrum === "none") {
            //doesnt work for no-spectrum lights, hub never reports back correct status unless brightness is changed. Unfortunately doing so turns on
            //a lamp that was switched off
            node.server.tradfri.operateLight(light,{"dimmer":(light.lightList[0].onOff?light.lightList[0].colorTemperature:0)},true).then(_ => {
            }).catch((err) => {node.debuglog("caught checkloop error " + err.message,"error"); clearInterval(node.aliveCheckinterval)});
          }else{
            node.server.tradfri.operateLight(light,{"dimmer":light.lightList[0].colorTemperature},true).then(_ => {
            }).catch((err) => {node.debuglog("caught checkloop error " + err.message,"error"); clearInterval(node.aliveCheckinterval)});
          }
          node.direction *= -1;
        }
      },secondsInterval
      );
    };

    node.registeredCallback = function(message) {
      let statusObject;

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
            node.send([{"payload": {"status":lightObject}}]);
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
          statusObject = message.content.gatewayReachable?{text: "Connected to gateway",fill: "green", shape: "ring"}:{text: "Disconnected from gateway",fill: "red", shape: "ring" };
          node.status(statusObject);
        },
        "remove": function(message){
          node.lightReachable = false;
          statusObject = {text: "removed",fill: "red", shape: "ring"};
          node.status(statusObject);
        }
      };
      actions[message.type](message);

    };

  }
  RED.nodes.registerType('ikea-light', IkeaLightNode);
};
//TODO: implement light removed
