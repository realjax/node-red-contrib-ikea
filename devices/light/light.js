
module.exports = function (RED) {
  'use strict';

  function IkeaLightNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.server = RED.nodes.getNode(config.gateway);
    node.connection = false
    node.status({fill: 'grey', shape: 'ring', text: 'not connected'});
    console.log("node.server.connected",node.server.connected);
    node.server.getConnection.then(
      () => node.onConnected(),
      () => node.status({fill: 'red', shape: 'ring', text: 'could not connect'})
    ).catch((err) => console.log(err));

    node.onConnected = function(){
      node.status({fill: 'green', shape: 'ring', text: 'Connected to gateway'});

    }
  }

  RED.nodes.registerType('ikea-light', IkeaLightNode);
};
