"use strict";

const serialise = require('../../common/serialise');

module.exports = function (RED) {

  function IkeaGatewayNode(config) {

    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.gatewayReachable = false;
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});
    node.retMsg = null;
    node.objectList = null;

    node.server.getConnection.then(
      () => node.onConnected(),
      () => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log("gateway error: ",err));

    node.onConnected = function(){
      node.status({fill: "green", shape: "ring", text: "connected (v. "+node.server.gateway[1].version+")"});
      node.gatewayReachable = node.server.gatewayReachable;
      node.server.registerListener(node.server.types.GATEWAY,node.type,config.id, node.registeredCallback);

      node.on("input", (msg) => {
        var retMsg = null;
        var retArray = [];
        var  objectList = {};

        if (msg.hasOwnProperty("payload") && node.gatewayReachable) {
          let cmd = msg.payload.toUpperCase();
          node.doAction(cmd);
          if (node.retMsg !== null) node.send([node.retMsg]);
        } // do nothing unless we have a payload and gateway is reachable

      });

      node.on("close", function(removed, done) {
        node.server.unregisterListener(node.server.types.GATEWAY,node.type, config.id);
        done();
      });

    };

    node.doAction = function(action){
      node.objectList, node.retMsg = null;
      let retArray = [];
      let runAction = {
        "REBOOT": function () {
          node.server.tradfri.rebootGateway().then(()=>node.debuglog("reboot has started"),()=>node.debuglog("reboot failed to start")).catch(err => console.log(err));
        },
        "STATUS": function(){
          node.retMsg = {"payload":{"status":serialise.basicGateway(node.server.gateway[1])}};
        },
        "DEVICES": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.ACCESSORY);
          for (let k in node.objectList) {
            retArray.push({id: parseInt(k),name: node.objectList[k].name,type: node.objectList[k].type});
          }
          node.retMsg = {"payload":{"devices":retArray}};
        },
        "LIGHTS": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.ACCESSORY);
          for (let k in node.objectList) {
            if (node.objectList[k].type == 2) {
              retArray.push({id: parseInt(k),name: node.objectList[k].name,type: node.objectList[k].type});
            }
            node.retMsg = {"payload":{"lights":retArray}};
          }
        },
        "GROUPS": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.GROUP);
          for (let k in node.objectList) {
            retArray.push({id: parseInt(k),name: node.objectList[k].name, devices:node.objectList[k].deviceIDs});
          }
          node.retMsg = {"payload":{"groups":retArray}};
        },
        "SCENES": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.SCENE);
          for (let k in node.objectList) {
            if (!node.objectList[k].isPredefined) {
              retArray.push({id: parseInt(k),name: node.objectList[k].name, isActive: node.objectList[k].isActive, lightSetting: node.objectList[k].lightSettings});
            }
            node.retMsg = {"payload":{"scenes":retArray}};
          }
        },
        "default": function () {
          // do nothing
        }
      };
      return runAction[action]!==undefined?runAction[action]():runAction["default"]();
    };

    node.debuglog = function(message){
      RED.log.debug(this.constructor.name + " '" + node.name +"'" +" : "+message);
    };


    node.registeredCallback = function(message){
      let eventMessage = message;
      let actions = {
        "status": function() {
          node.status({text: "connected (v. "+node.server.gateway[1].version+")",fill: "green", shape: "ring" });
          let retMsg = {"payload": {"status": serialise.basicGateway(eventMessage.content)}};
          node.send([retMsg]);
        },
        "connectivity": function(){
          node.gatewayReachable = message.content.gatewayReachable;
          let statusObject = node.gatewayReachable?{text: "connected (v. "+node.server.gateway[1].version+")",fill: "green", shape: "ring"}:{text: "disconnected",fill: "red", shape: "ring" };
          node.status(statusObject);
        }
      };
      actions[eventMessage.type]();
    };
  }
  RED.nodes.registerType("ikea-gateway", IkeaGatewayNode);
};