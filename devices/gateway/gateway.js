"use strict";

const _ = require('lodash');
const TC = require("node-tradfri-client");
const serialise = require('../../common/serialise');

module.exports = function (RED) {

  function IkeaGatewayNode(config) {

    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.connection = false
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});

    node.server.getConnection.then(
      () => node.onConnected(),
      () => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log(err));

    node.onConnected = function(){
      node.status({fill: "green", shape: "ring", text: "connected"});
      node.debuglog("received gateway connection");
      node.server.registerListener("gateway",config.id, node.registeredCallback);

      node.on("input", (msg) => {
        var retMsg = null;
        var retArray = [];
        var  objectList = {};

        if (!msg.hasOwnProperty("payload")) { return; } // do nothing unless we have a payload

          let cmd = msg.payload;
          switch (cmd.toUpperCase()) {
            case "REBOOT":
              node.server.tradfri.rebootGateway().then(()=>node.debuglog("reboot has started"),()=>node.debuglog("reboot failed to start")).catch(err => console.log(err));
              break;
            case "PLUGS":
            case "DEVICES":
              objectList = node.server.getTypeObjectList("device");
              for (let k in objectList) {
                retArray.push({id: parseInt(k),name: objectList[k].name,type: objectList[k].type});
              }
              retMsg = {"payload":{"devices":retArray}};
              break;
            case "LIGHTS":
              objectList = node.server.getTypeObjectList("device");
              for (let k in objectList) {
                if (objectList[k].type == 2) {
                  retArray.push({id: parseInt(k),name: objectList[k].name,type: objectList[k].type});
                }
                retMsg = {"payload":{"lights":retArray}};
              }
              break;
            case "GROUPS":
              objectList = node.server.getTypeObjectList("group");
              for (let k in objectList) {
                retArray.push({id: parseInt(k),name: objectList[k].name, devices:objectList[k].deviceIDs});
              }
              retMsg = {"payload":{"groups":retArray}};
              break;
            case "SCENES":
              objectList = node.server.getTypeObjectList("scene");
              for (let k in objectList) {
                if (!objectList[k].isPredefined) {
                  retArray.push({id: parseInt(k),name: objectList[k].name, isActive: objectList[k].isActive, lightSetting: objectList[k].lightSettings});
                }
                retMsg = {"payload":{"scenes":retArray}};
              }
              break;
          }
          if (retMsg !== null) node.send([retMsg]);

      });
      node.on("close", function(removed, done) {
        node.server.unregisterListener("gateway",config.id);
        done();
      });

    };
    node.debuglog = function(message){
      RED.log.debug(this.constructor.name + " '" + node.name +"'" +" : "+message);
    };


    node.registeredCallback = function(item){
      node.status({text: "connected (v. "+item.version+")",fill: "green", shape: "ring" });
      let retMsg = {"payload": serialise.toGatewayLite(item)};
      node.send([retMsg]);
    };
  }

  //register new type
  RED.nodes.registerType("ikea-gateway", IkeaGatewayNode);
};