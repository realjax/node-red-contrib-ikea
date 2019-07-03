module.exports = {
  lightFromAccessory : function (accessory) {
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

  toGatewayLite : function (gateway) {
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
      dstEndMinute:gateway.dstEndMinute,
      dstTimeOffset: gateway.dstTimeOffset
    });
  }
}

