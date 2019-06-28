const TC = require("node-tradfri-client");
const _ = require("lodash");

module.exports = function (RED) {

  function IkeaGatewayConfigNode(config) {
    var node = this;
    RED.nodes.createNode(this, config);
    node.name = config.name;
    node.psk = config.psk || 000;
    node.identity = config.identity || "unknown";
    node.address = config.address || '192.168.1.100';
    node.trafri = "";
    node.connected = false;

    node.accessories = {};
    node.groups = {};
    node.scenes = {};

    node.debuglog = function(message){
      RED.log.debug(node.name +" : "+message);
    };

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
            node.debuglog("connected is " + connected);
            node.tradfri.observeGateway().then(() => node.debuglog("observing gateway")).catch(err => node.debuglog("observing gateway failed"));
            node.tradfri.observeNotifications().then(() => node.debuglog("observing notifications")).catch(() => node.debuglog("observing notifications failed"));
            node.tradfri.observeGroupsAndScenes().then(() => node.debuglog("observing groups and scenes")).catch(() => node.debuglog("observing groups and scenes failed"));
            node.tradfri.observeDevices().then(() => node.debuglog("observing devices")).catch(() => node.debuglog("observing devices failed"));

            node.connected = true;

            node.tradfri
            .on("ping failed", (count) =>  node.debuglog(`${count} pings failed`))
            .on("connection lost", () =>{node.connected = false; node.debuglog("connection lost");})
            .on("connection alive", () =>{node.connected = true; node.debuglog("connection alive");})
            .on("device updated", node.itemUpdatedCallback)
            .on("group updated", node.itemUpdatedCallback)
            .on("scene updated", node.itemUpdatedCallback);

            resolve();
          },
          () => {
            node.debuglog("could not connect to gateway.");
            reject();
          }).catch(err => {
          console.log(err)
        });
      }else{
        resolve();
      }

    });

    node.itemUpdatedCallback = function(item){
      let type = item instanceof TC.Group?"group":item instanceof TC.Scene?"scene":"accessory";
      node.getTypeObject(type)[item.instanceId] = item;
    };

    node.getTypeObject = function(type){
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


  }

  RED.httpAdmin.get("/ikea-gateway-items", RED.auth.needsPermission("ikea-gateway-devices.read"), (req, res) => {


    let nodeId = req.query.nodeId;
    let type = req.query.type;

    let node = RED.nodes.getNode(nodeId);
    let requestedList = {};

    if (type = "lights") {
      requestedList = _.pickBy(node.getTypeObject(type), (val, key) => val.type == 2);
    } else {
      requestedList = node.getTypeObject(type);
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

  RED.httpAdmin.get("/ikea-gateway", RED.auth.needsPermission("ikea-gateway.read"), (req, res) => {

    var discover = async function(res) {
      try {
        var discovered = await TC.discoverGateway();
        //return discovered;
        return res.json([{"name": discovered.host}]);
      } catch (e){
        console.log(e)
        return res.json([{"name": "Nothing found, please enter manually"}]);
      }
    };
    discover(res);
  });


  RED.httpAdmin.get("/ikea-gateway-connect", RED.auth.needsPermission("ikea-gateway.connect"), (req, res) => {
    var connect = async function(res,req) {
      var error;
      var testTradfri = new TC.TradfriClient(req.query.address);
      try {
        var keys = await testTradfri.authenticate(req.query.code);
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
