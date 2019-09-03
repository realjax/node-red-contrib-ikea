# node-red-contrib-ikea-home-smart

* [License](LICENSE)
* [Changelog](RELEASE_NOTES.md)

[link text](#rebootNote)

The intention of this package is to bring together as many Ikea Home Smart devices as possible into a single and consistent way and to control them using Node Red.

Currently only a number of Ikea's Tradfri devices are supported.  The main difference with some comparable packages is that this tradfri implementation allows you to:
* Control/query the Tradfri gateway itself as well
* Detect if lights are being switched off using conventional wall switches (alive state).
* Does not require installing additional tools (eg. COAP clients)


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

<a name="abcd"></a>link example

![Example](example.png)


## Notes:

* <a name="rebootNote"></a>Unfortunately Ikea's gateway gets easily upset when it has a lot of requests to fulfil. Therefor I recommend a reboot of the gateway at specific intervals. Rebooting is a safe thing to do, all the gateway settings are preserved and no lights will suddenly turn on or off. I have minde set to reboot every day in the early hours of the morning, 
You can reboot it by sending the following payload to a gateway node:
```js
{"cmd":"reboot"}
```  
* Multiple gateways are not supported.