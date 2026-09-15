const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const gatePath = path.join(root, 'docs', 'ai', 'STAGE_GATE.json');
const currentStagePath = path.join(root, 'docs', 'ai', 'CURRENT_STAGE.md');
const allowedStatuses = new Set(['ACTIVE', 'BLOCKED', 'COMPLETE']);

function fail(message) {
  console.error(`Stage gate error: ${message}`);
  process.exitCode = 1;
}

let gate;

try {
  gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
} catch (error) {
  fail(`STAGE_GATE.json no es válido: ${error.message}`);
  return;
}

if (!Number.isInteger(gate.activeStage) || gate.activeStage < 1) {
  fail('activeStage debe ser un entero positivo.');
}

if (!Array.isArray(gate.stages) || gate.stages.length === 0) {
  fail('stages debe contener al menos una etapa.');
  return;
}

const activeStages = gate.stages.filter((stage) => stage.status === 'ACTIVE');

if (activeStages.length !== 1) {
  fail(`debe existir exactamente una etapa ACTIVE; se encontraron ${activeStages.length}.`);
}

gate.stages.forEach((stage, index) => {
  const expectedNumber = index + 1;

  if (stage.number !== expectedNumber) {
    fail(`la etapa en posición ${expectedNumber} debe tener number ${expectedNumber}.`);
  }

  if (!allowedStatuses.has(stage.status)) {
    fail(`la etapa ${stage.number} tiene un estado no permitido: ${stage.status}.`);
  }

  if (typeof stage.humanApproval !== 'boolean') {
    fail(`humanApproval de la etapa ${stage.number} debe ser booleano.`);
  }

  if (stage.number < gate.activeStage) {
    if (stage.status !== 'COMPLETE' || stage.humanApproval !== true) {
      fail(`la etapa ${stage.number} debe estar COMPLETE y aprobada antes de activar la ${gate.activeStage}.`);
    }
  } else if (stage.number === gate.activeStage) {
    if (stage.status !== 'ACTIVE') {
      fail(`la etapa ${stage.number} debe ser la única ACTIVE.`);
    }
  } else if (stage.status !== 'BLOCKED') {
    fail(`la etapa futura ${stage.number} debe permanecer BLOCKED.`);
  }

  if (stage.status === 'COMPLETE' && stage.humanApproval !== true) {
    fail(`la etapa ${stage.number} no puede estar COMPLETE sin aprobación humana.`);
  }
});

const currentStage = fs.readFileSync(currentStagePath, 'utf8');
const documentedNumber = currentStage.match(/- Número:\s*(\d+)/);
const documentedStatus = currentStage.match(/- Estado:\s*`([A-Z]+)`/);

if (!documentedNumber || Number(documentedNumber[1]) !== gate.activeStage) {
  fail('CURRENT_STAGE.md no coincide con activeStage.');
}

if (!documentedStatus || documentedStatus[1] !== 'ACTIVE') {
  fail('CURRENT_STAGE.md debe documentar la etapa actual como ACTIVE.');
}

if (!process.exitCode) {
  const active = activeStages[0];
  console.log(`Stage gate OK: etapa ${active.number} (${active.slug}) activa; etapas futuras bloqueadas.`);
}
