module.exports = {
  lightFromAccessory: function (accessory) {
    return Object.assign({}, {
      id: accessory.instanceId,
      name: accessory.name,
      model: accessory.deviceInfo.modelNumber,
      firmware: accessory.deviceInfo.firmwareVersion,
      alive: accessory.alive,
      on: accessory.lightList[0].onOff,
      onTime: accessory.lightList[0].onTime,
      brightness: accessory.lightList[0].dimmer,
      colorTemperature: accessory.lightList[0].colorTemperature,
      color: accessory.lightList[0].color,
      hue: accessory.lightList[0].hue,
      saturation: accessory.lightList[0].saturation,
      colorX: accessory.lightList[0].colorX,
      colorY: accessory.lightList[0].colorY,
      transition: accessory.lightList[0].transitionTime,
      created: accessory.createdAt,
      seen: accessory.lastSeen,
      type: accessory.type,
      power: accessory.deviceInfo.power
    });
  },
  lightColorTempComparator: function (obj1, obj2) {
    return (obj1.id == obj2.id) &&
    (obj1.name == obj2.name) &&
    (obj1.model == obj2.model) &&
    (obj1.firmware == obj2.firmware) &&
    (obj1.alive == obj2.alive) &&
    (obj1.on == obj2.on) &&
    (obj1.onTime == obj2.onTime) &&
    (obj1.brightness == obj2.brightness) &&
    (obj1.colorTemperature - obj2.colorTemperature < 3) &&
    (obj1.colorTemperature - obj2.colorTemperature > -3) &&
    (obj1.color == obj2.color) &&
    (obj1.hue == obj2.hue) &&
    (obj1.saturation == obj2.saturation) &&
    (obj1.colorX - obj2.colorX < 300) &&
    (obj1.colorX - obj2.colorX > -300) &&
    (obj1.colorY - obj2.colorY < 300) &&
    (obj1.colorY - obj2.colorY > -300) &&
    (obj1.transition == obj2.transition) &&
    (obj1.created == obj2.created) &&
    (obj1.seen == obj2.seen) &&
    (obj1.type == obj2.type) &&
    (obj1.power == obj2.power);
  },

  lightOperation: function (item) {
    return Object.assign({}, {
      onOff: item.onOff,
      dimmer: item.brightness,
      transitionTime: item.transitionTime,
      colorTemperature: item.colorTemperature,
      color: item.color,
      hue: item.hue,
      saturation: item.saturation
    });
  },
  basicGateway: function (gateway) {
    return Object.assign({}, {
      alexaPairStatus: gateway.alexaPairStatus || false,
      googleHomePairStatus: gateway.googleHomePairStatus,
      utcNowUnixTimestamp: gateway.utcNowUnixTimestamp,
      utcNowISODate: gateway.utcNowISODate,
      ntpServerUrl: gateway.ntpServerUrl,
      version: gateway.version,
      otaUpdateState: gateway.otaUpdateState,
      updateProgress: gateway.updateProgress,
      updatePriority: gateway.updatePriority,
      releaseNotes: gateway.releaseNotes,
      dstStartMonth: gateway.dstStartMonth,
      dstStartDay: gateway.dstStartDay,
      dstStartHour: gateway.dstStartHour,
      dstStartMinute: gateway.dstStartMinute,
      dstEndMonth: gateway.dstEndMonth,
      dstEndDay: gateway.dstEndDay,
      dstEndHour: gateway.dstEndHour,
      dstEndMinute: gateway.dstEndMinute,
      dstTimeOffset: gateway.dstTimeOffset
    });
  },
  eventMessage: function (type,message) {
    return Object.assign({}, {
      type: type,
      eventTime: new Date().getTime(),
      content: message
    });
  }
}

