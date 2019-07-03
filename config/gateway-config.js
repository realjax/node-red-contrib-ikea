const TC = require("node-tradfri-client");
const _ = require('lodash');
const serialise = require('../common/serialise');

module.exports = function (RED) {

  function IkeaGatewayConfigNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.name = config.name;
    node.psk = config.psk || 0;
    node.identity = config.identity || "unknown";
    node.address = config.address || '192.168.1.100';
    node.trafri = "";
    node.connected = false;

    node.accessories = {};
    node.groups = {};
    node.scenes = {};

    var listeners = {};

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.on("close", function() {
      node.tradfri.destroy();
      node.debuglog("COAP connection destroyed");
    });

    node.getConnection = new Promise(function(resolve, reject) {
      if (!node.connected) {
        node.tradfri = new TC.TradfriClient(node.address, {
          watchConnection: {
            maximumReconnects: 5,
            maximumConnectionAttempts: 5
          }
        });
        node.tradfri.connect(node.identity, node.psk).then(
          (connected) => {
            node.tradfri
              .on("ping failed", (count) =>  node.debuglog(`${count} pings failed`))
              .on("connection lost", () =>{node.connected = false; node.debuglog("connection lost");})
              .on("connection alive", () =>{node.connected = true; node.debuglog("connection alive");})
              .on("gateway offline", () => node.debuglog("gateway offline"))
              .on("reconnecting", (att, max) => node.debuglog(`reconnect attempt ${att} of ${max}`))
              .on("give up", () => node.debuglog("can't connect to gateway, giving up..."))
              .on("device updated",  node.itemUpdatedCallback)
              .on("group updated",   node.itemUpdatedCallback)
              .on("gateway updated", node.itemUpdatedCallback)
              .on("scene updated",   node.sceneUpdatedCallback)

              .on("rebooting", (reason) => {
                node.status({fill: "red", shape: "ring", text: "rebooting & reconnecting..."});
                debuglog(`rebooting gateway, reason: ${reason}`);
              });

            node.debuglog("connected to '"+node.identity+"'","info");

            node.tradfri.observeGateway().then(
                () => {
                  node.debuglog("observing gateway");
                  node.tradfri.observeNotifications().then(
                    () => {
                      node.debuglog("observing notifications");
                      node.tradfri.observeGroupsAndScenes().then(
                        ()=> {
                          node.debuglog("observing groups and scenes");
                          node.tradfri.observeDevices().then(
                            () => {
                              node.debuglog("observing devices");
                              resolve();
                            }
                          );
                        });
                  });

                })
              .catch(err => node.debuglog("Observe error: ",err));
/*
            node.tradfri.observeGateway().then(() => node.debuglog("observing gateway")).catch(err => node.debuglog("observing gateway failed"));
            node.tradfri.observeNotifications().then(() => node.debuglog("observing notifications")).catch(() => node.debuglog("observing notifications failed"));
            node.tradfri.observeGroupsAndScenes().then(() => node.debuglog("observing groups and scenes")).catch(() => node.debuglog("observing groups and scenes failed"));
            node.tradfri.observeDevices().then(() => node.debuglog("observing devices")).catch(() => node.debuglog("observing devices failed"));

            node.connected = true;
            resolve();
*/
          },
          () => {
            node.debuglog("could not connect to gateway '"+node.identity+"'","error");
            reject();
          }).catch(err => {
          console.log(err)
        });
      }else{
        resolve();
      }

    });

    node.itemUpdatedCallback = function(item){
      let type = item instanceof TC.Group?"group":item instanceof TC.Scene?"scene":item instanceof TC.GatewayDetails?"gateway":"accessory";
      //no list of gateways (yet) because node.tradfri.client doesnt support it
      if (type !== "gateway") {
        node.getTypeObjectList(type)[item.instanceId] = item;
      }
      node.notifyListeners(type, item)
    };

    node.sceneUpdatedCallback = function(id, item){
      return node.itemUpdatedCallback(item);
    };

    node.getTypeObjectList = function(type){
      let retObject = node.accessories;
      switch(type){
        case "group":
          retObject = node.groups;
          break;
        case "scene":
          retObject = node.scenes;
          break;
      }
      return retObject;
    };

    node.registerListener = function (type, deviceId, callback){
      let re = "";
      if (!listeners[type]) {
        listeners[type] = [];
      }
      let index = _.findIndex(listeners[type], ['deviceId', deviceId]);
      if( index == -1){
        listeners[type].push({"deviceId":deviceId,"callback":callback});
      }else{
        re = "RE-";
        listeners[type].splice(index,1);
        listeners[type].push({"deviceId":deviceId,"callback":callback});
      }
      node.debuglog(`[${type}: ${deviceId}] ${re}registered event listener`);
    };

    node.unregisterListener = function (type, deviceId){
      let position = _.findIndex(listeners[type], {'deviceId':deviceId});
      if(position >= 0){
          listeners[type].splice(position,1);
          node.debuglog(`[${deviceIde}: ${deviceId}] unregistered event listener`);
        }
    };

    node.notifyListeners = function(type, item){
      let types = listeners[type];
      if (types !== undefined){
        types.forEach((instance) =>{
          // gateway doesnt have instanceId so notify em all
          if (type == "gateway" || instance.deviceId == item.instanceId) {
            let callback = instance.callback;
            callback(item);
          }
        });
      }
    };

  }

  RED.httpAdmin.get("/ikea-gateway-items", RED.auth.needsPermission("ikea-gateway-devices.read"), (req, res) => {

    let nodeId = req.query.nodeId;
    let type = req.query.type;
    let configNode = RED.nodes.getNode(nodeId);
    let requestedList = configNode.getTypeObjectList(type);

    if (type = "lights") {
      requestedList = _.pickBy(configNode.getTypeObjectList(type), (value, key) => value.type == TC.AccessoryTypes.lightbulb);
    }

    let getDevices = async function(res) {
      let ret = [];
      for (let k in requestedList) {
        ret.push({name: requestedList[k].name, id:requestedList[k].instanceId});
      }
      res.json(JSON.stringify(ret));
    };
    getDevices(res);
  });


  RED.httpAdmin.get("/ikea-gateway-find", RED.auth.needsPermission("ikea-gateway.find"), (req, res) => {

    let discover = async function(res) {
      try {
        let discovered = await TC.discoverGateway();
        return res.json([{"name": discovered.host}]);
      } catch (e){
        return res.json([{"name": "Nothing found, please enter manually"}]);
      }
    };
    discover(res);
  });


  RED.httpAdmin.get("/ikea-gateway-authenticate", RED.auth.needsPermission("ikea-gateway.authenticate"), (req, res) => {

    let connect = async function(res,req) {
      let error;
      let testTradfri = new TC.TradfriClient(req.query.address);
      try {
        let keys = await testTradfri.authenticate(req.query.code);
        return res.json(keys);
      } catch (e) {
        if (e instanceof TC.TradfriError) {
          switch (e.code) {
            case TC.TradfriErrorCodes.ConnectionTimedOut: {
              error = "Could not connect, check IP/Host";
              break;
            }
            case TC.TradfriErrorCodes.AuthenticationFailed: {
              error = "The security code is wrong";
              break;
            }
            default:
              error = "unknown error";
          }
        }
        return res.json({"error":error});
      }
    };
    connect(res,req);
  });


  RED.nodes.registerType("ikea-smart-devices-gateway-config", IkeaGatewayConfigNode);

};
