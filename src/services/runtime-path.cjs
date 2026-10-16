'use strict';
// External interpreters and adapter processes require physical files outside ASAR.
const fs=require('node:fs');
function diskPath(file){const physical=file.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');if(physical!==file&&!fs.existsSync(physical))throw new Error('Packaged adapter resource is missing: '+physical);return physical;}
module.exports={diskPath};
