const TC = require("node-tradfri-client");
const _ = require('lodash');
const serialise = require('../common/serialise');

module.exports = function (RED) {

  RED.log.info("Ikea version " + require('../package.json').version );

  function IkeaGatewayConfigNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.name = config.name;
    node.psk = config.psk || 0;
    node.identity = config.identity || "unknown";
    node.address = config.address || '192.168.1.100';
    node.gatewayReachable = false;
    node.accessories = {};
    node.groups = {};
    node.scenes = {};
    node.gateways = {};
    node.groupNotifiers = [];

    let listeners = {};

    node.eventMessage = {
      STATUS: "status",
      CONNECTIVITY:"connectivity",
      REMOVE:"remove"
    };

    node.types = {
      GATEWAY: "gateway",
      ALL: "all",
      ACCESSORY: "accessory",
      GROUP : "group",
      SCENE: "scene"
    };

    node.debuglog = function(message, level = "debug"){
      eval('RED.log.'+level+'(this.constructor.name + " \'" + node.name +"\'" +" : "+message)');
    };

    node.on("close", function() {
      node.killObservers();
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
          () => {
            node.tradfri
              .on("ping failed", (count) =>  node.debuglog(`${count} pings failed`))
              .on("connection lost", _ => {
                node.setGatewayState({"gatewayReachable":false});
                node.killObservers();
                node.debuglog("connection lost");
              })
              .on("connection alive",  _ =>{
                node.startObservers(_ => {});
                node.debuglog("connection alive");
                node.setGatewayState({"gatewayReachable":true});
              })
              .on("gateway offline", _ => {
                node.setGatewayState({"gatewayReachable":false});
                node.killObservers();
                node.debuglog("gateway offline");
              })
              .on("reconnecting", (att, max) => {
                node.setGatewayState({"gatewayReachable":false});
                node.killObservers();
                node.debuglog(`reconnect attempt ${att} of ${max}`)
              })
              .on("give up", () => node.debuglog("can't connect to gateway, giving up..."))
              .on("device updated",  node.itemUpdatedCallback)
              .on("group updated",   node.itemUpdatedCallback)
              .on("device removed",  instanceId => node.itemRemoved(node.getTypeObjectList("default"),instanceId))
              .on("group removed",   instanceId => node.itemRemoved(node.getTypeObjectList("group"),instanceId))
              .on("gateway updated", node.itemUpdatedCallback)
              .on("scene updated",   (id, item) => node.itemUpdatedCallback(item))
              .on("rebooting", (reason) => {
                node.setGatewayState({"gatewayReachable":false});
                node.killObservers();
                node.debuglog(`rebooting gateway, reason: ${reason}`);
              })
              .on("error",(error) => {
                node.setGatewayState({"gatewayReachable":false});
                node.killObservers();
                node.debuglog(`Captured an Error!!!:  ${error}`);
              });

            node.debuglog("connected to '"+node.identity+"'","info");
            node.setGatewayState({"gatewayReachable":true});

            node.startObservers(resolve);
          },
          () => {
            node.debuglog("could not connect to gateway '"+node.identity+"'","error");
            reject();
          }).catch(err => {
          node.debuglog(err.message,"error");
        });
      }else{
        resolve();
      }
    });


    node.startObservers = function(done){
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
        .catch(err => node.debuglog("Observer error: ",err));
    };

    node.killObservers = function(){
      node.tradfri.stopObservingDevices();
      node.tradfri.stopObservingGroups();
      node.tradfri.stopObservingNotifications();
      node.tradfri.stopObservingGateway();
    };

    node.itemUpdatedCallback = function(item){
      let type = item instanceof TC.Group?node.types.GROUP:item instanceof TC.Scene?node.types.SCENE:item instanceof TC.GatewayDetails?node.types.GATEWAY:node.types.ACCESSORY;
      //no list of gateways (yet) because node.tradfri.client doesnt support it, so there's only one instance: 1
      if (type === node.types.GATEWAY) {
        item["instanceId"]=1;
      }

      node.getTypeObjectList(type)[item.instanceId] = item;
      let message = serialise.eventMessage("status",item);
      node.notifyListeners(type, message)
      // if type is an accessory, also notify any groups it may belong to.
      if (type === node.types.ACCESSORY && item.type === TC.AccessoryTypes.lightbulb) {

        node.getGroupForAccessory(item.instanceId).forEach( group => {

            // always update & send alive status if light is a spectrum light
            //if (item.lightList[0].spectrum != "none") {
              node.groups[group.instanceId].alive = item.alive;
              let alivemessage = serialise.eventMessage("status", node.groups[group.instanceId]);
              node.notifyListeners(node.types.GROUP, alivemessage);
            //}

            // schedule group updates until no more lights in a group pass here
            if (node.groupNotifiers[group.instanceId] !== undefined) {
              // if there's already a timer set for this group, cancel it
              clearTimeout(node.groupNotifiers[group.instanceId]);
            }
            // set a timer to update the group in 500 msecs. Will be replaced when a new light passes here that belongs to the same group
            node.groupNotifiers[group.instanceId] = setTimeout(
              () => {
                let message = node.getDebouncedGroupMessage(group);
                if (message !== null) {
                  node.notifyListeners(node.types.GROUP, message);
                }
              },500
            );
          }
        )
      }

    };

    node.getDebouncedGroupMessage = (group) => { // create an event message when certain settings for all lights in a group are the same, else return null.
      let allLightsInGroup =  _.chain(group.deviceIDs)
                            .filter(id => node.getAccessory(id) !== undefined && node.getAccessory(id).type === TC.AccessoryTypes.lightbulb)
                            .map((id)=>serialise.lightFromAccessory(node.getAccessory(id)))
                            .value();
      let allOnOffSame  = _.every(allLightsInGroup, (item) => allLightsInGroup[0].on === item.on);
      let allDimmerSame = _.every(allLightsInGroup, (item) => allLightsInGroup[0].brightness === item.brightness);
      if (allOnOffSame){
        node.groups[group.instanceId].onOff = allLightsInGroup[0].on;
      }
      if (allDimmerSame){
        node.groups[group.instanceId].dimmer = allLightsInGroup[0].brightness;
      }
      return allOnOffSame || allDimmerSame?serialise.eventMessage("status", node.groups[group.instanceId]):null;
    }

    node.getAccessory = function(deviceId){
      return node.getTypeObjectList(node.types.ACCESSORY)[deviceId];
    };

    node.getGroup = function(groupId){
      return node.getTypeObjectList(node.types.GROUP)[groupId];
    };

    node.getGroupForAccessory = function(deviceId) {
      return _.chain(node.groups)
        .filter(group => group.deviceIDs.includes(deviceId))
        .value()
    }

    node.getTypeObjectList = function(type){
      let types = {
        "group"   : _ => node.groups,
        "scene"   : _ => node.scenes,
        "gateway" : _ => node.gateways,
        "default" : _ => node.accessories
      };
      return (types[type] || types['default'])();
    };

    node.registerListener = function (type, deviceId, instanceId, callback){
      let re = "";
      if (!listeners[type]) {
        listeners[type] = [];
      }
      let index = _.findIndex(listeners[type], (item) => {return (item.deviceId === deviceId && item.instanceId === instanceId);});
      if( index === -1){
        listeners[type].push({"deviceId":deviceId,"instanceId":instanceId,"callback":callback});
      }else{
        re = "RE-";
        listeners[type].splice(index,1);
        listeners[type].push({"deviceId":deviceId,"instanceId":instanceId,"callback":callback});
      }
      node.debuglog(`[${type}: ${deviceId} (${instanceId})] ${re}registered event listener`);
    };

    node.unregisterListener = function (type, deviceId, instanceId){
      let position = _.findIndex(listeners[type], (item) => {return (item.deviceId === deviceId && item.instanceId === instanceId);});
      if(position >= 0){
          listeners[type].splice(position,1);
          node.debuglog(`[${type}: ${deviceId}] unregistered event listener`);
        }
    };

    node.getListenersForType =function(type){
      return _.chain(listeners)
              .filter((value,key) => {
                  if (type === node.types.ALL || (type === key )) {
                    return value;
                  }
                })
              .flatMap()
              .value();
    }

    node.notifyListeners = function(type, message){
      node.getListenersForType(type).forEach((instance) =>{
        // gateway doesnt have instanceId so notify em all
        if (type ===  node.types.ALL || type ===  node.types.GATEWAY || instance.deviceId === message.content.instanceId) {
          let callback = instance.callback;
          callback(message);
        }
      });

    };

    node.setGatewayState = function(stateObject){
      node.gatewayReachable = stateObject.gatewayReachable;
      let message = serialise.eventMessage("connectivity",stateObject);
      node.notifyListeners(node.types.ALL, message);
    };

    node.itemRemoved = function(type,instanceId){
      /* node.getTypeObjectList(type)[instanceId] = item
       delete node.getTypeObjectList(type)[instanceId];
       let deviceInGroup = node.getGroupForAccessory(instanceId)
       if (deviceInGroup !== null) {
          _.remove(node.groups[deviceInGroup].deviceIds, function(n){n == instanceId})
       }
      */

      let message = serialise.eventMessage("remove",{"instanceId":instanceId});
      //node.notifyListeners(node.types.ALL, message);
    };

  }

  RED.httpAdmin.get("/ikea-gateway-items", RED.auth.needsPermission("ikea-gateway-devices.read"), (req, res) => {
    //TODO check for  (valid) nodeId
    let nodeId = req.query.nodeId;
    let type = req.query.type;
    let configNode = RED.nodes.getNode(nodeId);
    let getSpectrumLightsInGroup = function(group){
      return _.chain(group.deviceIDs)
        .filter(id => configNode.getAccessory(id).type === TC.AccessoryTypes.lightbulb &&
                      configNode.getAccessory(id).lightList[0].spectrum != "none")
        .value()
    };

    let getDeviceObject = function(item) {
      let objects = {
        "light": function (item) {
          return {name: item.name, id: item.instanceId, spectrum: item.lightList[0].spectrum != "none"}
        },
        "group": function (item) {
          return {name: item.name, id: item.instanceId, spectrumLightId:getSpectrumLightsInGroup(item)[0]}
        },
        "default": function (item) {
          return {name: item.name, id: item.instanceId}
        },
      };
      return (objects[req.query.type] || objects['default'])(item);
    };

    let requestedList = _.chain(configNode.getTypeObjectList(type))
        .filter(function(item) {
          if (type === "light") {
            return item.type === TC.AccessoryTypes.lightbulb;
          }else{
            return true;
          }
        })
        .sortBy(function(item) {
          return item.name.toLowerCase();
        })
        .value();


    let getDevices = async function(res) {
      let ret = [];
      for (let k in requestedList) {
        ret.push(getDeviceObject(requestedList[k]));
      }
      res.json(JSON.stringify(ret));
    };
    getDevices(res);
  });


  RED.httpAdmin.get("/ikea-gateway-find", RED.auth.needsPermission("ikea-gateway.find"), (req, res) => {

    let discover = async function(res) {
      try {
        let discovered = await TC.discoverGateway();
        let ipHostArray = [{"iphost": discovered.host}];
        if (discovered.addresses !== undefined && discovered.addresses.length){
          ipHostArray.unshift({"iphost": discovered.addresses[0]});
        }
        return res.json(ipHostArray);
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

};// TODO: probleem met eerste start en aanmaken lamp oplossen.
