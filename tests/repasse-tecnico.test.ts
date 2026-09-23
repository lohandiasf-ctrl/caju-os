import assert from 'node:assert/strict';
import test from 'node:test';
import { chaveDoTecnico, cidadeEUf, erroDoNomeDoTecnico, nomeDoTecnico, tecnicoComMesmoNome } from '../lib/repasse-tecnico.ts';

test('nome digitado é limpo e comparado sem acento nem maiúscula', () => {
  assert.equal(nomeDoTecnico('  Carlos   Antônio '), 'Carlos Antônio');
  assert.equal(chaveDoTecnico('CARLOS ANTÔNIO'), chaveDoTecnico('carlos antonio'));
  const cadastro = [{ id: 1, name: 'Carlos Antonio' }, { id: 2, name: 'Ana Souza' }];
  assert.equal(tecnicoComMesmoNome(cadastro, 'carlos  antônio')?.id, 1);
  assert.equal(tecnicoComMesmoNome(cadastro, 'Carlos Alberto'), null);
});

test('nome do técnico precisa ter letras e caber no limite', () => {
  assert.equal(erroDoNomeDoTecnico('Zé'), null);
  assert.equal(erroDoNomeDoTecnico('Arthur Bruno de Oliveira'), null);
  assert.match(erroDoNomeDoTecnico('   ') ?? '', /Informe/);
  assert.match(erroDoNomeDoTecnico('123') ?? '', /Escreva/);
  assert.match(erroDoNomeDoTecnico('a'.repeat(81)) ?? '', /80/);
});

test('cidadeEUf separa a UF quando vem junto', () => {
  assert.deepEqual(cidadeEUf('Nova Cruz/RN'), { cidade: 'Nova Cruz', uf: 'RN' });
  assert.deepEqual(cidadeEUf('Patos - pb'), { cidade: 'Patos', uf: 'PB' });
  assert.deepEqual(cidadeEUf('Vitória da Conquista'), { cidade: 'Vitória da Conquista', uf: '' });
  assert.deepEqual(cidadeEUf(undefined), { cidade: '', uf: '' });
});
