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
    node.gatewayReachable = false;
    node.accessories = {};
    node.groups = {};
    node.scenes = {};

    var listeners = {};

    node.types = {
      GATEWAY: "gateway",
      ALL: "all",
      ACCESSORY: "accesory",
      GROUP : "group",
      SCENE: "scene"
    }


    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.on("close", function() {
      node.tradfri.destroy();
      node.debuglog("COAP connection destroyed");
    });

    node.getConnection = new Promise(function(resolve, reject) {
      if (!node.gatewayReachable) {
        node.tradfri = new TC.TradfriClient(node.address, {
          watchConnection: {
            failedPingCountUntilOffline: 4,
            maximumReconnects: 5,
            maximumConnectionAttempts: 5
          }
        });
        node.tradfri.connect(node.identity, node.psk).then(
          (connected) => {
            node.tradfri
              .on("ping failed", (count) =>  node.debuglog(`${count} pings failed`))
              .on("connection lost", () =>{node.killObservators();node.debuglog("connection lost");node.setGatewayState({"gatewayReachable":false});})
              .on("connection alive", () =>{node.startObservations(()=>{});node.debuglog("connection alive");node.setGatewayState({"gatewayReachable":true});})
              .on("gateway offline", () => {node.killObservators(); node.debuglog("gateway offline");node.setGatewayState({"gatewayReachable":false});})
              .on("reconnecting", (att, max) => node.debuglog(`reconnect attempt ${att} of ${max}`))
              .on("give up", () => node.debuglog("can't connect to gateway, giving up..."))
              .on("device updated",  node.itemUpdatedCallback)
              .on("group updated",   node.itemUpdatedCallback)
              .on("gateway updated", node.itemUpdatedCallback)
              .on("scene updated",   node.sceneUpdatedCallback)
              .on("rebooting", (reason) => {
                node.setGatewayState({"gatewayReachable":false});
                node.status({fill: "red", shape: "ring", text: "rebooting & reconnecting..."});
                node.debuglog(`rebooting gateway, reason: ${reason}`);
              })
              .on("error",(error) => {
                node.debuglog(`Error occured:  ${error}`);
              });

            node.debuglog("connected to '"+node.identity+"'","info");
            node.setGatewayState({"gatewayReachable":true});

            node.startObservations(resolve);
          },
          () => {
            node.debuglog("could not connect to gateway '"+node.identity+"'","error");
            reject();
          }).catch(err => {
          console.log("somerror:",err)
        });
      }else{
        resolve();
      }

    });






    node.startObservations = function(done){
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
                      done();
                    }
                  );
                });
            });

        })
        .catch(err => node.debuglog("Observe error: ",err));
    }

    node.killObservators = function(){
      node.tradfri.stopObservingDevices();
      node.tradfri.stopObservingGroups();
      node.tradfri.stopObservingNotifications();
      node.tradfri.stopObservingGateway();
    }


    node.itemUpdatedCallback = function(item){
      let type = item instanceof TC.Group?node.types.GROUP:item instanceof TC.Scene?node.types.SCENE:item instanceof TC.GatewayDetails?node.types.GATEWAY:node.types.ACCESSORY;
      //no list of gateways (yet) because node.tradfri.client doesnt support it
      if (type !== node.types.GATEWAY) {
        node.getTypeObjectList(type)[item.instanceId] = item;
      }
      node.notifyListeners(type, item)
    };

    node.sceneUpdatedCallback = function(id, item){
      return node.itemUpdatedCallback(item);
    };

    node.getAccessory = function(deviceId){
      return node.getRawAccessory(deviceId).lightList[0];
    };

    node.getRawAccessory = function(deviceId){
      return node.getTypeObjectList(node.types.ACCESSORY)[deviceId];
    };

    node.getTypeObjectList = function(type){
      let retObject = node.accessories;
      switch(type){
        case node.types.GROUP:
          retObject = node.groups;
          break;
        case node.types.SCENE:
          retObject = node.scenes;
          break;
      }
      return retObject;
    };

    node.registerListener = function (type, deviceId, instanceId, callback){
      let re = "";
      if (!listeners[type]) {
        listeners[type] = [];
      }
      let index = _.findIndex(listeners[type], (item) => {return (item.deviceId == deviceId && item.instanceId == instanceId);});
      if( index == -1){
        listeners[type].push({"deviceId":deviceId,"instanceId":instanceId,"callback":callback});
      }else{
        re = "RE-";
        listeners[type].splice(index,1);
        listeners[type].push({"deviceId":deviceId,"instanceId":instanceId,"callback":callback});
      }
      node.debuglog(`[${type}: ${deviceId} (${instanceId})] ${re}registered event listener`);
    };

    node.unregisterListener = function (type, deviceId, instanceId){
      let position = _.findIndex(listeners[type], (item) => {return (item.deviceId == deviceId && item.instanceId == instanceId);});
      if(position >= 0){
          listeners[type].splice(position,1);
          node.debuglog(`[${type}: ${deviceId}] unregistered event listener`);
        }
    };

    node.notifyListeners = function(type, item){
      let types =  _.chain(listeners)
                    .filter((value,key) => {
                      if (type == node.types.ALL || (type == key )) {
                        return value;
                      }
                    })
                    .flatMap()
                    .value();
      types.forEach((instance) =>{
        // gateway doesnt have instanceId so notify em all
        if (type ==  node.types.GATEWAY || instance.deviceId == item.instanceId) {
          let callback = instance.callback;
          callback(item);
        }
      });

    };

    node.getListener = function (type, deviceId, instanceId){
      return _.chain(listeners[type])
              .filter((value,key) => {
                if (value.deviceId === deviceId && value.instanceId === instanceId){
                  return value;
                }
              })
              .value();
    };

    node.debug = function(type){
            let  iets
      console.log(iets);
    };

    node.setGatewayState = function(stateObject){
      node.gatewayReachable = stateObject.gatewayReachable;
      for (let type in listeners) {
        listeners[type].forEach((instance) =>{
            let callback = instance.callback;
            callback(stateObject);
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
      requestedList = _.chain(configNode.getTypeObjectList(type))
        .filter(function(item) {
          return item.type == TC.AccessoryTypes.lightbulb;
        })
        .sortBy(function(item) {
          return item.name.toLowerCase();
        })
        .value();
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
