# iDriveSafe, version 1.3.3: (April 1, 2025)
This is WEB application based on Apps from Gurtam (http://apps.wialon.com).

**This is a legacy app: it is no longer developed or maintained. The code is published as is, without support.**

## Description
iDriveSafe is a comprehensive driving quality control system that allows to evaluate drivers’ behavior and the way they treat their vehicles.  
Therefore, this easy-to-use and very effective App helps not only to extend the car’s life, but to ensure goods safety, if we speak about trucking company.  
The App records three main parameters: sudden acceleration, sharp turn and hard braking. All the maneuvers with violations are displayed in a special table with brief explanatory information. You can personally set the evaluation criteria, i.e. the «loyalty» mode, changing response level to different violations. Also, you can choose the vehicle type that is also taken into account while calculating the final score. iDriveSafe goes perfect with any type of GPS/GLONASS tracking hardware, which makes it absolutely flexible.

## License
[The MIT License](LICENSE-MIT)

## Requirements
 * Browser: a current version of Google Chrome, Firefox, Safari or Edge
 * Language: en, bg, br, da, es, et, fa, fi, fr, hu, it, lv, pl, ru, sk, tr, uk
 * Components: SDK
 * URL params: Active SID, Base URL, Host URL, Language, Current user

## Quick start
Apps activation through the management system: https://help.wialon.com/en/wialon-hosting/user-guide/management-system/apps  
Working with applications in the GPS tracking system: https://help.wialon.com/en/wialon-hosting/user-guide/monitoring-system/apps

## Installation
The repository contains the app in the form it is hosted in. Put the files on a web server and open `index.html` with the URL params listed above, for example
`index.html?sid=<Active SID>&baseUrl=https://hst-api.wialon.com&user=<Current user>&lang=en`.

 * On start the page requests `/idrivesafe/app/app.json` and the optional `/idrivesafe/whitelabel.json` (white label settings) by absolute paths, so host the app under the `/idrivesafe/` path to have them picked up.
 * The date interval picker, the WebGIS layer for Leaflet and the datepicker locales are loaded from `//apps.wialon.com/plugins/`.
 * The trips of a unit with the maneuvers detected in them come from a backend at `/idrivesafe/get`, the settings of vehicle types from `/idrivesafe/settings`. The backend is not a part of this repository.
