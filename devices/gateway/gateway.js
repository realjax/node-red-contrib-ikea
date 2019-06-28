"use strict";

const TC = require("node-tradfri-client");
const _ = require('lodash');

let _devices = {};
let _groups = {};
let _scenes = {};
let _listeners = {};


module.exports = function (RED) {

  function IkeaGatewayNode(config) {
    var node = this;
    RED.nodes.createNode(node, config);
    var tradfri = null;
    var _clientConnected = false;

    node.gateway = RED.nodes.getNode(config.gateway);
    node.healthcheck = parseInt(config.healthcheck) || 60;

    if (node.gateway && node.gateway.address && node.gateway.psk && node.gateway.identity) {
      //initial status
      node.status({fill: "grey", shape: "ring", text: "not connected"});

      tradfri = new TC.TradfriClient(this.gateway.address,{watchConnection:{maximumReconnects: 5,maximumConnectionAttempts: 5}});

      tradfri.connect(this.gateway.identity, this.gateway.psk).then(
        (connected) => {
          node.status({fill: "green", shape: "ring", text: "connected"});
          debuglog("connected is "+connected);
          _clientConnected = connected;
           tradfri.observeGateway().then(()=>debuglog("observing gateway")).catch(err => console.log("foutje hier"));
           tradfri.observeNotifications(()=>debuglog("observing notifications")).catch(()=>debuglog("observing notifications failed"));
           tradfri.observeGroupsAndScenes(()=>debuglog("observing groups and scenes")).catch(()=>debuglog("observing groups and scenes failed"));
           tradfri.observeDevices(()=>{}).catch(()=>debuglog("observingDevices failed"));
          },
        () => {
          node.status({fill: "red", shape: "ring", text: "connection error"});
          debuglog("could not connect to gateway.");
        }).catch(err => {console.log("foutje")});


    }else{
      node.status({fill: "grey", shape: "ring", text: "not configured"});
    }

    // tradfri events
    tradfri
      .on("gateway updated", (gw) => {
        node.status({fill: "green", shape: "ring", text: "connected (v. "+gw.version+")"});
      })
      .on("rebooting", (reason) => {
        node.status({fill: "red", shape: "ring", text: "rebooting & reconnecting..."});
        debuglog(`rebooting gateway, reason: ${reason}`);
      })
      .on("device updated", _deviceUpdatedCallback)
      .on("group updated", _groupUpdatedCallback)
      .on("scene updated", _sceneUpdatedCallback)

      .on("ping failed", (count) => console.log(`${count} pings failed`))
    //  .on("ping succeeded", () => console.log("ping succeeded"))
      .on("connection lost", () => console.log("connection lost"))
      .on("connection failed", (att, max) => console.log(`connection failed: attempt ${att} of ${max}`))
      .on("connection alive", () => console.log("connection alive"))
      .on("gateway offline", () => console.log("gateway offline"))
      .on("reconnecting", (att, max) => { console.log(`reconnect attempt ${att} of ${max}`);node.status({fill: "red", shape: "ring", text: `attempt ${att} of ${max}`});})
      .on("give up", () => console.log("giving up..."));



    node.on("close", function(removed, done) {
      if (removed) {
        console.log("node removed")
      } else {
        // This node is being restarted
        console.log("node restarted")
        if (_clientConnected) {
          tradfri.reset();
        }
        destroyClient();
      }
      done();
    });

    node.on("input", (msg) => {
      var retMsg = null;
      var retArray = [];
      if (!msg.hasOwnProperty("payload")) { return; } // do nothing unless we have a payload
      if (_clientConnected) {
        let cmd = msg.payload;
        switch (cmd.toUpperCase()) {
          case "REBOOT":
              tradfri.rebootGateway().then(()=>debuglog("reboot has started"),()=>debuglog("reboot failed to start")).catch(err => console.log(err));
            break;
          case "DEVICES":
            for (let k in _devices) {
              //console.log({id: parseInt(k),name: _devices[k].name,type: _devices[k].type});
              retArray.push({id: parseInt(k),name: _devices[k].name,type: _devices[k].type});
            }
            retMsg = {"payload":{"devices":retArray}};
            break;
          case "LIGHTS":
            for (let k in _devices) {
              if (_devices[k].type == 2) {
                //console.log({id: parseInt(k), name: _devices[k].name,type: _devices[k].type});
                retArray.push({id: parseInt(k), name: _devices[k].name,type: _devices[k].type});
              }
              retMsg = {"payload":{"lights":retArray}};
            }
            break;
          case "GROUPS":
            for (let k in _groups) {
              console.log({id: parseInt(k),name: _groups[k].name, devices:_groups[k].deviceIDs});
              retArray.push({id: parseInt(k),name: _groups[k].name, devices:_groups[k].deviceIDs});
            }
            retMsg = {"payload":{"groups":retArray}};
            break;
          case "SCENES":
            for (let k in _scenes) {
              if (!_scenes[k].isPredefined) {
                console.log({
                  id: parseInt(k),
                  name: _scenes[k].name,
                  isActive: _scenes[k].isActive,
                  lightSetting: _scenes[k].lightSettings
                });
              }
              retMsg = {"payload":{"scenes":retArray}};
            }
            break;
        }
        if (retMsg !== null) node.send([retMsg]);
      }
     })

    function debuglog(message){
      RED.log.debug(node.type +" : "+message);
    }

    function errorlog(message){
      RED.log.error(node.type +" : "+message);
    }

    function destroyClient() {
      if (_clientConnected) {
        client.destroy();
      }
    }
    function _deviceUpdatedCallback(accessory){
       _devices[accessory.instanceId] = accessory;
      //if (_listeners[accessory.instanceId]) {
      //  for (let nodeId in _listeners[accessory.instanceId]) {
      //    _listeners[accessory.instanceId][nodeId](accessory);
      //  }
     }

    function _groupUpdatedCallback(group){
      //console.log(group)
      _groups[group.instanceId] = group;
    }

    function _sceneUpdatedCallback(groupId, scene){
      _scenes[scene.instanceId] = scene;
    }

  }





  //register new type
  RED.nodes.registerType("ikea-gateway", IkeaGatewayNode);
};