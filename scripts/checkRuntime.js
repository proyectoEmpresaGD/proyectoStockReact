import { execFileSync } from 'node:child_process';

const EXPECTED_NODE_MAJOR = 24;
const RECOMMENDED_NODE = '24.21.0';
const EXPECTED_NPM_MAJOR = 11;
const RECOMMENDED_NPM = '11.19.0';

const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split('.')[0]);

let npmVersion = 'desconocida';
try {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  npmVersion = execFileSync(npmCommand, ['-v'], { encoding: 'utf8' }).trim();
} catch {
  console.error('❌ No se ha podido ejecutar npm desde PATH.');
  process.exit(1);
}

const npmMajor = Number(npmVersion.split('.')[0]);
let failed = false;

if (nodeMajor === EXPECTED_NODE_MAJOR) {
  console.log(`✅ Node ${nodeVersion} compatible con el proyecto (24.x).`);
  if (nodeVersion !== RECOMMENDED_NODE) {
    console.log(`ℹ️  Versión local recomendada para este proyecto: Node ${RECOMMENDED_NODE}.`);
  }
} else {
  console.error(`❌ Node ${nodeVersion} no es compatible con la configuración actual. Se requiere Node 24.x.`);
  failed = true;
}

if (npmMajor === EXPECTED_NPM_MAJOR) {
  console.log(`✅ npm ${npmVersion} compatible con el proyecto (11.x).`);
  if (npmVersion !== RECOMMENDED_NPM) {
    console.log(`ℹ️  Versión incluida con Node ${RECOMMENDED_NODE}: npm ${RECOMMENDED_NPM}.`);
  }
} else {
  console.error(`❌ npm ${npmVersion} no coincide con el requisito 11.x.`);
  failed = true;
}

if (failed) process.exit(1);
console.log('✅ Runtime preparado para ProyectoStock.');
