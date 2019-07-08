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
    node.gatewayReachable = true // is the gateway reachable? ( for instance when coap client can't talk to gateway momentarily)
    node.interval = null;
    node.lastMessageReceived = {};
    node.direction = 1;
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.server.getConnection.then(
      () => node.onConnected(),
      () => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log("light error: ",err));

    node.onConnected = function(){
      node.gatewayReachable = node.server.gatewayReachable;
      node.status({fill: 'green', shape: 'ring', text: 'Connected to gateway'});
      node.server.registerListener(node.server.types.ACCESSORY,config.deviceId,node.id, node.registeredCallback);

      if (config.detectAlive) {
        node.aliveCheckLoop();
      }
      node.on("input", (msg) => {
        if (!msg.hasOwnProperty("payload") || !node.lightReachable || !node.gatewayReachable) { return; } // do nothing unless we have a payload and the everything is up and running.
        let retMsg = null;
        let light = node.server.getAccessory(config.deviceId)
        let cmd = msg.payload;
        switch (cmd.toUpperCase()) {
          case "TOGGLE":
             light.toggle().catch((err)=>console.log("error toggling ", err));
            break;
          case "TURNON":
            light.turnOn().then(() => console.log("was turned on")).catch((err)=>console.log("err ", err));
            break;
          case "TURNOFF":
            light.turnOff().then(() => console.log("was turned off")).catch((err)=>console.log("err ", err));
            break;
          case "SETCOLORTEMPERATURE":
            light.setColorTemperature(60).then(() => console.log("colortemp set to 60")).catch((err)=>console.log("err ", err));
            break;
          case "STATUS":
            retMsg = {"payload":{"status":serialise.lightFromAccessory(node.server.getRawAccessory(config.deviceId))}};
            break;
        }
        if (retMsg !== null) node.send([retMsg]);
      });

      node.on("close", function(removed, done) {
        clearInterval(node.aliveCheckinterval);
        node.server.unregisterListener(node.server.types.ACCESSORY,config.deviceId,node.id);
        done();
      });
    };

    node.aliveCheckLoop = function(){
      let secondsInterval = 20000 + ((Math.floor(Math.random() * 20) + 1 ) * 1000); // random between 20 and 40 seconds.
      node.aliveCheckinterval = setInterval(() => {
        node.debuglog("in the aliveCheckLoop every "+ secondsInterval/1000 + " seconds")
        let light = node.server.getAccessory(config.deviceId);
        //if (node.lightReachable) {
          // increase and decrease colortemp continuously to detect an alive = false situation.
          light.setColorTemperature(light.colorTemperature + node.direction).then(()=>{}).catch((err)=>console.log("caught checkloop error ",err));
          node.direction *= -1;
        //}
      },secondsInterval
      );
    };

    node.registeredCallback = function(item) {
      if (item.gatewayReachable !== undefined && config.detectAlive) {
        !item.gatewayReachable ? clearInterval(node.aliveCheckinterval) : node.aliveCheckLoop();
      }else{
        let message = serialise.lightFromAccessory(item);
        if (!_.isEqualWith(node.lastMessageReceived, message, serialise.lightColorTempComparator)) {
          let stateColor = !item.alive ? "red" : item.lightList[0].onOff ? "green" : "grey";
          node.status({
            fill: stateColor,
            shape: 'ring',
            text: 'Light is ' + (stateColor == "red" ? "not powered" : stateColor == "green" ? "on" : "off")
          });
          node.send([{"payload": message}]);
        }
        node.lightReachable = item.alive;
        node.lastMessageReceived = message;
      }
    };
  }

  RED.nodes.registerType('ikea-light', IkeaLightNode);
};
