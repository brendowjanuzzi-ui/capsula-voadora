# AURORA GT/2 — Mk.III

Uma experiência WebGL de engenharia especulativa para a cápsula AURORA GT/2. A Mk.III mantém o objeto cinematográfico da Mk.II e adiciona um casco paramétrico, um diagrama de corpo livre e telemetria calculada em unidades SI.

> A aeronave, o Gravium-7 e sua arquitetura de propulsão são ficcionais. O balanço de peso, sustentação equivalente, tração, arrasto e aceleração usa mecânica clássica e teoria de disco atuador.

## Executar

```bash
npm run serve
# abrir http://localhost:4173
```

Não há etapa de build. O Three.js usado pela experiência está em `vendor/three`; as fontes web são opcionais e têm fallback de sistema.

## Mk.III

- **Casco paramétrico:** comprimento, boca e altura atualizam a escala do modelo, as cotas 3D, o volume elipsoidal, a área frontal e o arrasto.
- **Modo Engenharia:** console responsivo com perfis de pairado, cruzeiro e subida; parâmetros de massa, atmosfera, velocidade e potência.
- **Vetores de força:** sustentação, peso, tração, arrasto e força resultante renderizados sobre a aeronave, com magnitude em kN.
- **Telemetria:** T/P, acelerações, pressão dinâmica, número de Reynolds, potência, autonomia ideal e histórico de aceleração.
- **Solver determinístico:** cálculos isolados em `src/physics.js`, sem números aleatórios ou tabelas pré-computadas.

## Modelo físico

O solver usa:

- peso: `W = m·g`;
- arrasto: `D = ½ρV²CdA`;
- disco atuador: `P = 2ρA·vi·(V + vi)²` e `T = 2ρA·vi·(V + vi)`;
- dinâmica: `a = ΣF / m`;
- geometria: volume exato de um elipsoide e aproximação de Knud Thomsen para a área molhada.

A velocidade induzida do disco atuador é encontrada por bisseção estável, inclusive em velocidade de avanço zero. A autonomia exibida é a razão ideal entre a energia nominal e a potência instantânea, sem reserva ou perdas auxiliares.

## Testes

```bash
npm test
```

A suíte cobre peso em SI, lei quadrática do arrasto, resposta do disco atuador à potência, consistência força/aceleração, impacto da geometria paramétrica e limites de entrada.
