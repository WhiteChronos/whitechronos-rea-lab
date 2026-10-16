// Teste próprio do NOVO produto; o alvo de análise não é importado.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {sum} from './sum.mjs';
test('positive and negative operands',()=>{assert.equal(sum(2,3),5);assert.equal(sum(-2,2),0);});
test('rejects nonnumeric input',()=>{assert.throws(()=>sum('2',3),TypeError);});
