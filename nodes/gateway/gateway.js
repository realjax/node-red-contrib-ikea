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
    ).catch((err) => node.debuglog(err.message,"error"));

    node.onConnected = function(){
      node.status({fill: "green", shape: "ring", text: "connected (v. "+node.server.gateways[1].version+")"});
      node.gatewayReachable = node.server.gatewayReachable;
      node.server.registerListener(node.server.types.GATEWAY,node.type,config.id, node.registeredCallback);

      node.on("input", (msg) => {
        var retMsg = null;
        var retArray = [];
        var  objectList = {};

        if (msg.hasOwnProperty("payload") && msg.payload.hasOwnProperty("cmd") && node.gatewayReachable) {
          node.doAction(msg);
          if (node.retMsg !== null) node.send([node.retMsg]);
        } // do nothing unless we have a payload and gateway is reachable

      });

      node.on("close", function(removed, done) {
        node.server.unregisterListener(node.server.types.GATEWAY,node.type, config.id);
        done();
      });

    };

    node.doAction = function(msg){
      let action = msg.payload.cmd.toUpperCase();
      node.objectList, node.retMsg = null;
      let retArray = [];
      let runAction = {
        "REBOOT": function () {
          node.retMsg = {"payload":{"status":"rebooting","reason": "initiated by client"}};
          node.server.tradfri.rebootGateway().then(()=>node.debuglog("reboot has started"),()=>node.debuglog("reboot failed to start")).catch(err => node.debuglog(err.message,"error"));
        },
        "GETSTATUS": function(){
          node.retMsg = {"payload":{"status":serialise.basicGateway(node.server.gateways[1])}};
        },
        "GETDEVICES": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.ACCESSORY);
          for (let k in node.objectList) {
            retArray.push({deviceId: parseInt(k),name: node.objectList[k].name,type: node.objectList[k].type});
          }
          node.retMsg = {"payload":{"devices":retArray}};
        },
        "GETLIGHTS": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.ACCESSORY);
          for (let k in node.objectList) {
            if (node.objectList[k].type == 2) {
              retArray.push({deviceId: parseInt(k),name: node.objectList[k].name,type: node.objectList[k].type});
            }
            node.retMsg = {"payload":{"lights":retArray}};
          }
        },
        "GETGROUPS": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.GROUP);
          for (let k in node.objectList) {
            retArray.push({groupId: parseInt(k),name: node.objectList[k].name, devices:node.objectList[k].deviceIDs});
          }
          node.retMsg = {"payload":{"groups":retArray}};
        },
        "GETSCENES": function () {
          node.objectList = node.server.getTypeObjectList(node.server.types.SCENE);
          for (let k in node.objectList) {
            if (!node.objectList[k].isPredefined) {
              retArray.push({sceneId: parseInt(k),name: node.objectList[k].name, isActive: node.objectList[k].isActive, lightSetting: node.objectList[k].lightSettings});
            }
            node.retMsg = {"payload":{"scenes":retArray}};
          }
        },
        "SETLIGHTPROPERTIES": (payload) => {
          if (payload.hasOwnProperty("properties") && typeof payload.properties === 'object' && payload.hasOwnProperty("deviceId")) {
            try {
              let lightOperation = serialise.lightOperation(payload.properties);
              node.server.tradfri.operateLight(node.server.getAccessory(payload.deviceId),lightOperation);
            } catch (err){
              node.debuglog("Could not set the light properties. Please make sure the properties and the deviceId are valid. Error: "+err.message,"warn");
            }
          }
        },
        "SETGROUPPROPERTIES": (payload) => {
          if (payload.hasOwnProperty("properties") && typeof payload.properties === 'object' && payload.hasOwnProperty("groupId")) {
            try {
              let groupOperation = serialise.lightOperation(payload.properties);
              node.server.tradfri.operateGroup(node.server.getGroup(payload.groupId),groupOperation);
            } catch (err){
              node.debuglog("Could not set the group properties. Please make sure the properties and the groupId are valid. Error: "+err.message,"warn");
            }
          }
        },
        "default": function () {
          // do nothing
        }
      };
      return (runAction[action] || runAction['default'])(msg.payload);
    };

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };


    node.registeredCallback = function(message){
      let actions = {
        "status": function(message) {
          node.status({text: "connected (v. "+node.server.gateways[1].version+")",fill: "green", shape: "ring" });
          let retMsg = {"payload": {"status": serialise.basicGateway(message.content)}};
          node.send([retMsg]);
        },
        "connectivity": function(message){
          node.gatewayReachable = message.content.gatewayReachable;
          let statusObject = node.gatewayReachable?{text: "connected (v. "+node.server.gateways[1].version+")",fill: "green", shape: "ring"}:{text: "disconnected",fill: "red", shape: "ring" };
          node.status(statusObject);
        }
      };
      actions[message.type](message);
    };
  }
  RED.nodes.registerType("ikea-gateway", IkeaGatewayNode);
};