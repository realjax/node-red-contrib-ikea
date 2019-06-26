"use strict";

const TC = require("node-tradfri-client");


function createMessage(message, rinfo) {
  let payload = JSON.parse(message.toString());
  if (payload.data) {
    payload.data = JSON.parse(payload.data);
  }

  return {
    fromip: `${rinfo.address}:${rinfo.port}`,
    ip: rinfo.address,
    port: rinfo.port,
    payload: payload
  };
}




module.exports = function (RED) {

  function IkeaGatewayNode(config) {
    var node = this;
    RED.nodes.createNode(node, config);
    var tradfri = null;
    var _clientConnected = false;
    var _lights = {};
    var _listeners = {};

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
        (connected) => {
          node.status({fill: "red", shape: "ring", text: "connection error"});
          debuglog("could not connect to gateway.");
        }).catch(err => {console.log("foutje")});


    }else{
      node.status({fill: "grey", shape: "ring", text: "not configured"});
    }



    // tradfri events
    tradfri
      .on("gateway updated", (gw) => {
        node.status({text: "connected (v. "+gw.version+")"});
      })
      .on("rebooting", (reason) => {
        this.status({fill: "red", shape: "ring", text: "rebooting"});
        debuglog("rebooting gateway, reason: ${reason}");
      })
      .on("device updated", _deviceUpdatedCallback)
      .on("ping failed", (count) => console.log(`${count} pings failed`))
      .on("ping succeeded", () => console.log("ping succeeded"))
      .on("connection lost", () => console.log("connection lost"))
      .on("connection failed", (att, max) => console.log(`connection failed: attempt ${att} of ${max}`))
      .on("connection alive", () => console.log("connection alive"))
      .on("gateway offline", () => console.log("gateway offline"))
      .on("reconnecting", (att, max) => console.log(`reconnect attempt ${att} of ${max}`))
      .on("give up", () => console.log("giving up..."))
      .on("device updated", (acc) => console.log(`device with ID ${acc.instanceId} updated...`));



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
      if (!msg.hasOwnProperty("payload")) { return; } // do nothing unless we have a payload
      if (_clientConnected) {
        let cmd = msg.payload;
        switch (cmd.toUpperCase()) {
          case "REBOOT":
              tradfri.rebootGateway().then(()=>debuglog("reboot has started"),()=>debuglog("reboot failed to start")).catch(err => console.log(err));
            break;
          case "DEVICES":
            for (let k in _lights) {
              console.log({type: _lights[k].type,name: _lights[k].name, id: k});
            }
            break;
        }
      }

      return [null];
    })

    function debuglog(message){
      RED.log.debug(node.type +" : "+message);
    }

    function errorlog(message){
      RED.log.error(node.type +" : "+message);
    }

    function destroyClient() {
      console.log("we here")
      if (_clientConnected) {
        client.destroy();
      }
    }
    function _deviceUpdatedCallback(accessory){
      if (accessory.type === TC.AccessoryTypes.lightbulb) {
        _lights[accessory.instanceId] = accessory;
      }
      //if (_listeners[accessory.instanceId]) {
      //  for (let nodeId in _listeners[accessory.instanceId]) {
      //    _listeners[accessory.instanceId][nodeId](accessory);
      //  }

    }

  }



  RED.httpAdmin.get("/ikea-gateway", RED.auth.needsPermission("ikea-gateway.read"), (req, res) => {

    var discover = async function(res) {
      try {
        var discovered = await TradfriClient.discoverGateway();
        //return discovered;
        return res.json([{"name": discovered.host}]);
      } catch (e){
        return res.json([{"name": "Nothing found, please enter manually"}]);
      }
    };
    discover(res);
  });

  RED.httpAdmin.get("/ikea-gateway-devices", RED.auth.needsPermission("ikea-gateway-devices.read"), (req, res) => {

   var getDevices = async function(res) {
      try {
        let ret = [];
        for (let k in _lights) {
          ret.push({name: _lights[k].name, id: k});
        }
        return  res.json(JSON.stringify(ret));
      } catch (e){
        console.log(e);
        return res.json([{"error": "no devices found"}]);
      }
    };
    getDevices(res,req);
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

  //register new type
  RED.nodes.registerType("ikea-gateway", IkeaGatewayNode);
};