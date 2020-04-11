# node-red-contrib-ikea

* [Changelog](RELEASE_NOTES.md)


The intention of this package is to bring together as many Ikea Home Smart devices as possible into a single and consistent way and to control them using Node-RED.
It is based on Alcalzone's [Node-tradfri-client](https://github.com/AlCalzone/node-tradfri-client) and parts of his documentation are used here as well. 

Currently only a number of Ikea's Tradfri devices are supported.  The main difference with some comparable packages is that this tradfri implementation allows you to:
* Control/query the Tradfri gateway itself as well and for instance request lists of lights, groups and scenes.
* Detect `alive` state: whether lights are being switched off using conventional (wall) switches. _Only works for spectrum lights, ie: white spectrum or RGB_
* Lights and groups can be toggled ( when off switch on and vice versa), turned on or off and control brightness or color. The status of a light can also be retrieved. 
* Does not require installing additional stand alone tools (COAP client is integrated)

### Why another Ikea node for Node-RED?

There are several reasons; the already existing nodes were either too limited, outdated and/or not open for further development. But the main 
reason for me was the fact that the existing ones do not take the use of conventional (wall) switches into account. A hub can't 'see' when a light was switched off by cutting its power. 
When that happens the hub has no reason to think the light is off and reports it as still on.
It could easily be fixed if a hub would check every so often if a light bulb is still `alive`.<br>
And that is exactly what this node does.<br>
It is done by force sending the light bulb's state to the bulb (a bulb, which currently has `alive` set to true) every so many seconds. 
After a few tries the hub detects it can't set it and reports back the correct `alive` state of the bulb (`alive` is false). The node then stops checking the 
bulb until it is switched on again. 

Spectrum lights (RGB and white spectrum) allow the brightness to be changed without it affecting the visible state of the bulb. 
However,when you change the brightness of a switched off, non-spectrum light bulb (the cheapest Ikea ones) it *also* switches the bulb on!<br>
This is the reason you can only track the 'alive' state of spectrum lights in this node. You can also only track the `alive` state of a group when that group contains 
at least one spectrum light.          


This module currently contains the following nodes to provide integration of the Ikea smart home devices into Node-RED.

* Gateway
* Lights
* Groups

# Installation
To install this module use Node-Red GUI installer. 
Or run this console command in the `.node-red` folder:

```
npm i node-red-contrib-ikea
```

### Example

Here is an example of commands that can be send to the gateway itself. See the documentation within Node-RED for more info.

 ![Example](https://github.com/realjax/supportFiles/raw/master/images/ikea-home-smart-gateway-example.png)

Code:
```js
[{"id":"39f809bb.09ded6","type":"ikea-gateway","z":"96304071.45851","gateway":"e07f6086.631ba","name":"","x":560,"y":500,"wires":[["4389664f.000228"]]},{"id":"ca0ac358.8e8b5","type":"inject","z":"96304071.45851","name":"","topic":"","payload":"{\"cmd\":\"getStatus\"}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":210,"y":320,"wires":[["39f809bb.09ded6"]]},{"id":"9ee79fcf.b448e","type":"inject","z":"96304071.45851","name":"","topic":"","payload":"{\"cmd\":\"getDevices\"}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":220,"y":380,"wires":[["39f809bb.09ded6"]]},{"id":"761e3b96.450034","type":"inject","z":"96304071.45851","name":"","topic":"","payload":"{\"cmd\":\"getLights\"}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":210,"y":440,"wires":[["39f809bb.09ded6"]]},{"id":"86dc5f16.f1d3e","type":"inject","z":"96304071.45851","name":"","topic":"","payload":"{\"cmd\":\"getGroups\"}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":220,"y":560,"wires":[["39f809bb.09ded6"]]},{"id":"4389664f.000228","type":"debug","z":"96304071.45851","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","x":750,"y":500,"wires":[]},{"id":"70d0cde.9804534","type":"inject","z":"96304071.45851","name":"","topic":"","payload":"{\"cmd\":\"getScenes\"}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":220,"y":680,"wires":[["39f809bb.09ded6"]]},{"id":"2eabe17a.86b0be","type":"inject","z":"96304071.45851","name":"","topic":"","payload":"{\"cmd\":\"reboot\"}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":540,"y":600,"wires":[["39f809bb.09ded6"]]},{"id":"d4dd7bad.b941d8","type":"inject","z":"96304071.45851","name":"setLightproperties","topic":"","payload":"{\"cmd\":\"setLightProperties\",\"deviceId\":\"65551\",\"properties\":{\"on\":true,\"dimmer\":100,\"transitionTime\":1.5,\"colorTemperature\":50,\"color\":\"efd275\",\"hue\":4,\"saturation\":5}}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":150,"y":500,"wires":[["39f809bb.09ded6"]]},{"id":"992212bb.52741","type":"inject","z":"96304071.45851","name":"setGroupProperties","topic":"","payload":"{\"cmd\":\"setGroupProperties\",\"groupId\":\"131073\",\"properties\":{\"on\":true,\"dimmer\":100,\"transitionTime\":1.5,\"sceneId\":196628}}","payloadType":"json","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":150,"y":620,"wires":[["39f809bb.09ded6"]]},{"id":"e07f6086.631ba","type":"ikea-smart-devices-gateway-config","z":"","name":"test","address":"192.168.1.50","identity":"tradfri_765467","psk":"erytgyiyugtfytgu"}]
```


## Notes and disclaimers:
* Unfortunately Ikea's gateway gets easily upset when it has a lot of requests to fulfil. 
Therefor I recommend a reboot of the gateway at specific intervals. 
Rebooting is a safe thing to do, all the gateway settings are preserved and no lights will suddenly turn on or off. 
I have mine set to reboot every day in the early hours of the morning, 
You can reboot it by sending the following payload to a gateway node:
```js
{"cmd":"reboot"}
```  
* Be aware that after an (automatic) update of the firmware of the gateway or your lamps, strange things may occur to your lights.  If you're lucky only the light settings get messed up (color and/or brightness) but lights may also vanish and then you have to manually re-add them again using an Ikea remote. When this happens 
you also have to renew the corresponding light nodes and/or group nodes (even when you name them exactly the same) because the internal ID's get changed and this plugin will 
no longer be able to find them, unless you re-select, save and deploy them. 
* Alive status detection only works on spectrum lights, ie: white spectrum or RGB
* Multiple gateways are not supported.


## Bugs and other issues:
This has been in development for quite some time and has also been running in my own home for a while. Still, bugs will most likely surface at some point. 
If you find any, please [open an issue](https://github.com/realjax/node-red-contrib-ikea/issues).   

