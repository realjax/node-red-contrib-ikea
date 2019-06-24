module.exports = function (RED) {

  function IkeaGatewayConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.psk = config.psk || 000;
    this.identity = config.identity || "unknown";
    this.address = config.address || '192.168.1.100';
  }

  RED.nodes.registerType("ikea-smart-devices-gateway-config", IkeaGatewayConfigNode);

};
