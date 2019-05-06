module.exports = function (RED) {

  function IkeaGatewayConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.deviceList = config.deviceList || [];
    this.securityCode = config.securityCode || 1234;
    this.address = config.address || '192.168.1.100';

    this.getDeviceName = function (sid) {
      for (let i in this.deviceList) {
        if (this.deviceList[i].sid === sid) {
          return this.deviceList[i].desc;
        }
      }

      return null;
    }
  }

  RED.nodes.registerType("ikea-gateway-config", IkeaGatewayConfigNode);

};
