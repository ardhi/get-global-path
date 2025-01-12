# get-global-path

Returns path to globally installed package.

Based on [https://github.com/rosen-vladimirov/global-modules-path](https://github.com/rosen-vladimirov/global-modules-path); packaged as ES6 module and make it to work with Node.js CVE-2024-27980

## Setup

npm install get-global-path

## Usage

```javascript
import getGlobalPath from 'get-global-path'

const path = getGlobalPath('<pkg-name>')
```

MIT