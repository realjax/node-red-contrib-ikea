const serialise = require('../../common/serialise');
const _ = require('lodash');

module.exports = function (RED) {
  'use strict';

  function IkeaLightNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.connection = false;
    node.lastMessageReceived = {}
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.server.getConnection.then(
      () => node.onConnected(),
      () => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log(err));

    node.onConnected = function(){
      node.status({fill: 'green', shape: 'ring', text: 'Connected to gateway'});
      node.server.registerListener("accessory",config.deviceId, node.registeredCallback);

      //node.aliveCheck();



      node.on("input", (msg) => {
        if (!msg.hasOwnProperty("payload")) { return; } // do nothing unless we have a payload


        let retMsg = null;
        let light = node.server.getTypeObjectList("light")[config.deviceId].lightList[0];
        let cmd = msg.payload;
        switch (cmd.toUpperCase()) {
          case "TOGGLE":
             light.toggle().then(() => console.log("toggled")).catch((err)=>console.log("err ", err));
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
            //do something
            break;
        }
        if (retMsg !== null) node.send([retMsg]);
      });

      node.on("close", function(removed, done) {
        node.server.unregisterListener("light",config.deviceId);
        done();
      });
    };

    node.registeredCallback = function(item){
      let message = serialise.lightFromAccessory(item);
      if (!_.isEqual(node.lastMessageReceived,message)) {
        let stateColor = !item.alive ? "red" : item.lightList[0].onOff ? "green" : "grey";
        node.status({
          fill: stateColor,
          shape: 'ring',
          text: 'Light is ' + (stateColor == "red" ? "not alive" : stateColor == "green" ? "on" : "off")
        });
        node.send([{"payload": message}]);
        node.lastMessageReceived = message;
      }

    };
  }

  RED.nodes.registerType('ikea-light', IkeaLightNode);
};
