# node-red-contrib-ikea-home-smart

* [License](LICENSE)
* [Changelog](RELEASE_NOTES.md)


The intention of this package is to bring together as many Ikea Home Smart devices as possible into a single and consistent way and to control them using Node Red.
It is based on Alcalzone's [Node-tradfri-client](https://github.com/AlCalzone/node-tradfri-client) and parts of his documentation are used here as well. 

Currently only a number of Ikea's Tradfri devices are supported.  The main difference with some comparable packages is that this tradfri implementation allows you to:
* Control/query the Tradfri gateway itself as well and for instance request lists of lights, groups and scenes.
* Detect `alive` state: whether lights are being switched off using conventional (wall) switches. _Only works for spectrum lights, ie: white spectrum or RGB_
* Does not require installing additional tools (eg. COAP clients)

###Why another Ikea node for Node-RED?

There are several reasons: the already existing nodes were either too limited, outdated and/or not open for further development. But the main 
reason for me was the fact that the existing ones do not take the use of conventional (wall) switches into account. A hub can't 'see' when a light was switched off by cutting its power. 
When that happens the hub has no reason to think the light is off and reports it is still on.
It could easily be fixed if a hub would check every so often if a light bulb is still `alive`.<br>
And that is exactly what this node does.<br>
It is done by sending a state change to a light bulb (which currently has `alive` set to true) every so many seconds. 
After a few tries the hub detects it can set the state and reports back the correct `alive` state of the bulb (`alive` is false). The node then stops checking the 
bulb until it is switched on again. 
Because I use Alcalzone's [Node-tradfri-client](https://github.com/AlCalzone/node-tradfri-client) it is unfortunately not possible 
to send the exact same state to a light bulb. The node-tradfr-client detects it contains no changes and doesn't send it out. So a slight change is needed.
Spectrum lights (RGB and white spectrum) allow the brightness to be changed without it affecting the visible state of the bulb. <br>
However,when you change the brightness of a switched off, non-spectrum light bulb (the cheapest Ikea ones) it *also* switches the bulb on!<br>
This is the reason you can only track the 'alive' state of spectrum lights in this node. You can also only track the `alive` state of a group when that group contains 
at least one spectrum light.          


This module currently contains the following nodes to provide integration of the Ikea smart home devices into node-red.

* Gateway
* Lights
* Groups

# Installation
To install this module use Node-Red GUI installer. Or run this console command in the `.node-red` folder:

```
npm i node-red-contrib-ikea-home-smart
```

### Example

<a name="abcd">link example</a>

![Example](example.png)


## Notes:

* Unfortunately Ikea's gateway gets easily upset when it has a lot of requests to fulfil. 
Therefor I recommend a reboot of the gateway at specific intervals. 
Rebooting is a safe thing to do, all the gateway settings are preserved and no lights will suddenly turn on or off. 
I have mine set to reboot every day in the early hours of the morning, 
You can reboot it by sending the following payload to a gateway node:
```js
{"cmd":"reboot"}
```  
* Multiple gateways are not supported.
* Alive status detection only works on spectrum lights, ie: white spectrum or RGB