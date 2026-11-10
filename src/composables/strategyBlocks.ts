// Wickfleet Blockly blocks for the strategy editor. Shapes and field names
// match strategySpec.ts, which converts to and from the hub's spec.
import * as Blockly from 'blockly';
import {
  COMPARE_OPS,
  type Indicator,
  KIND_PARAMS,
  NUMBER_OPS,
  PRICES,
  refsFor,
} from './strategySpec';

const SOURCES: [string, string][] = PRICES.map((p) => [p, p]);
const OP_LABEL: Record<string, string> = {
  '>': 'is above',
  '<': 'is below',
  '>=': 'is at or above',
  '<=': 'is at or below',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
  '==': 'equals',
};

// Names a loaded spec uses, so a dropdown keeps them while the workspace
// is still being built; plus whether model outputs are offered.
let known: string[] = [];
let modelOn = false;

export function setKnownRefs(refs: string[], model: boolean) {
  known = refs;
  modelOn = model;
}

export function setModel(model: boolean) {
  modelOn = model;
}

function workspaceIndicators(ws: Blockly.Workspace | null): Indicator[] {
  if (!ws) return [];
  return ws
    .getAllBlocks(false)
    .filter((b) => b.type.startsWith('wf_ind_') && b.getRootBlock().type === 'wf_indicators')
    .map((b) => ({ id: String(b.getFieldValue('ID')), kind: b.type.replace('wf_ind_', '') }));
}

function refOptions(this: Blockly.FieldDropdown): [string, string][] {
  const ws = this.getSourceBlock()?.workspace ?? null;
  const refs = new Set([...refsFor(workspaceIndicators(ws), modelOn), ...known]);
  const cur = this.getValue();
  if (cur) refs.add(String(cur));
  return [...refs].map((r) => [r, r]);
}

const PARAM_FIELD: Record<string, () => Blockly.Field> = {
  source: () => new Blockly.FieldDropdown(SOURCES),
  period: () => new Blockly.FieldNumber(14, 1, 500, 1),
  shift: () => new Blockly.FieldNumber(0, 0, 50, 1),
  stddev: () => new Blockly.FieldNumber(2, 0.1, 5, 0.1),
  fast: () => new Blockly.FieldNumber(12, 1, 500, 1),
  slow: () => new Blockly.FieldNumber(26, 1, 500, 1),
  signal: () => new Blockly.FieldNumber(9, 1, 500, 1),
  smooth_k: () => new Blockly.FieldNumber(3, 1, 500, 1),
  smooth_d: () => new Blockly.FieldNumber(3, 1, 500, 1),
};

const KIND_LABEL: Record<string, string> = {
  sma: 'average',
  ema: 'exp. average',
  tema: 'triple exp. average',
  highest: 'highest',
  lowest: 'lowest',
  rsi: 'RSI',
  atr: 'ATR',
  adx: 'ADX',
  bollinger: 'Bollinger',
  macd: 'MACD',
  stoch: 'stochastic',
};

let defined = false;

/** Register the block types once. */
export function defineBlocks() {
  if (defined) return;
  defined = true;
  for (const [kind, params] of Object.entries(KIND_PARAMS)) {
    Blockly.Blocks[`wf_ind_${kind}`] = {
      init(this: Blockly.Block) {
        const row = this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput(kind), 'ID')
          .appendField(`= ${KIND_LABEL[kind]}`);
        for (const p of params) {
          row.appendField(p.replace('_', ' ')).appendField(PARAM_FIELD[p]!(), p.toUpperCase());
        }
        this.setPreviousStatement(true, 'wf_ind');
        this.setNextStatement(true, 'wf_ind');
        this.setColour(210);
        this.setTooltip(`${KIND_LABEL[kind]}; refer to it by its id`);
      },
    };
  }
  Blockly.Blocks.wf_indicators = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('Indicators');
      this.appendStatementInput('ITEMS').setCheck('wf_ind');
      this.setColour(210);
      this.setDeletable(false);
    },
  };
  for (const [type, label, hue] of [
    ['wf_entry', 'Buy when', 120],
    ['wf_exit', 'Sell when', 0],
  ] as const) {
    Blockly.Blocks[type] = {
      init(this: Blockly.Block) {
        this.appendDummyInput()
          .appendField(label)
          .appendField(
            new Blockly.FieldDropdown([
              ['all of these', 'all'],
              ['any of these', 'any'],
            ]),
            'MODE',
          );
        this.appendStatementInput('CONDS').setCheck('wf_cond');
        this.setColour(hue);
        this.setDeletable(false);
      },
    };
  }
  Blockly.Blocks.wf_cmp = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(refOptions), 'LEFT')
        .appendField(new Blockly.FieldDropdown(COMPARE_OPS.map((o) => [OP_LABEL[o]!, o])), 'OP')
        .appendField(new Blockly.FieldDropdown(refOptions), 'RIGHT');
      this.setPreviousStatement(true, 'wf_cond');
      this.setNextStatement(true, 'wf_cond');
      this.setColour(60);
    },
  };
  Blockly.Blocks.wf_cmp_num = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(refOptions), 'LEFT')
        .appendField(new Blockly.FieldDropdown(NUMBER_OPS.map((o) => [OP_LABEL[o]!, o])), 'OP')
        .appendField(new Blockly.FieldNumber(0), 'RIGHT');
      this.setPreviousStatement(true, 'wf_cond');
      this.setNextStatement(true, 'wf_cond');
      this.setColour(60);
    },
  };
  Blockly.Blocks.wf_trend = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(refOptions), 'LEFT')
        .appendField('is')
        .appendField(
          new Blockly.FieldDropdown([
            ['rising', 'rising'],
            ['falling', 'falling'],
          ]),
          'DIR',
        )
        .appendField('over')
        .appendField(new Blockly.FieldNumber(3, 1, 50, 1), 'BARS')
        .appendField('candles');
      this.setPreviousStatement(true, 'wf_cond');
      this.setNextStatement(true, 'wf_cond');
      this.setColour(60);
    },
  };
}

/** The palette: one block per indicator kind, then the three conditions. */
export function toolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Indicators',
        colour: '210',
        contents: Object.keys(KIND_PARAMS).map((k) => ({ kind: 'block', type: `wf_ind_${k}` })),
      },
      {
        kind: 'category',
        name: 'Conditions',
        colour: '60',
        contents: ['wf_cmp', 'wf_cmp_num', 'wf_trend'].map((type) => ({ kind: 'block', type })),
      },
    ],
  };
}
