# AURORA GT/2 — Mk.V

Uma experiência WebGL de engenharia especulativa para a cápsula AURORA GT/2. A Mk.V substitui o visual ilustrado das iterações anteriores por renderização fisicamente coerente: microsuperfícies PBR procedurais, um hangar 3D completo ao redor da aeronave e reflexos gerados a partir do próprio ambiente.

A cena abre **de dia**: o seletor de ambiente permite alternar entre hangar e campo aberto e entre luz diurna e noturna, com iluminação, atmosfera e reflexos recalculados para cada combinação.

> A aeronave, o Gravium-7 e sua arquitetura de propulsão são ficcionais. O balanço de peso, sustentação equivalente, tração, arrasto e aceleração usa mecânica clássica e teoria de disco atuador.

## Executar

```bash
npm run serve
# abrir http://localhost:4173
```

Não há etapa de build. O Three.js usado pela experiência está em `vendor/three`; as fontes web são opcionais e têm fallback de sistema.

## Ambiente: cenário × período do dia

O painel no canto inferior esquerdo cruza dois eixos, gerando quatro ambientes. A experiência inicia em **hangar · dia**.

- **Hangar · dia:** as luminárias de teto se apagam, claraboias abrem faixas de sol no piso e um retângulo de luz entra pelo portão. Céu azul com cúmulos além do vão, neblina rala e exposição reduzida.
- **Hangar · noite:** o esquema original — key quente de teto, recorte ciano do portão, sódio âmbar, cones volumétricos, poeira suspensa e céu de entardecer com skyline aceso.
- **Campo aberto · dia:** heliponto elevado sobre um campo, domo panorâmico equiretangular, faixa de horizonte com colinas e arvoredo, disco solar, nuvens em deriva, biruta e sol direcional com sombra nítida e paralela.
- **Campo aberto · noite:** o mesmo terreno sob céu estrelado com Via Láctea e lua fria.

A troca é imediata: as duas variantes de cada textura são pré-geradas e os mapas de ambiente ficam em cache (`PMREM`, no máximo quatro), então os reflexos do casco sempre correspondem ao que está em cena sem recalcular a cada clique.

## Mk.V

- **Hangar volumétrico real:** o fundo deixa de ser uma imagem estática. Piso de concreto com juntas e manchas, parede de painéis, portão entrevisto ao entardecer com skyline, treliças, luminárias com cones de luz e poeira suspensa compõem a cena — com paralaxe verdadeira ao orbitar.
- **Materiais PBR procedurais:** albedo, rugosidade e mapa de normais gerados em canvas (2048 px) para casco, titânio escovado, fibra de carbono twill, couro, piso e paredes. Determinísticos via gerador LCG interno, sem assets externos.
- **Reflexos coerentes:** o `scene.environment` é renderizado por PMREM a partir do próprio hangar, então o casco reflete as fitas de LED, o portão e as luminárias reais da cena.
- **Detalhe pontual por peça:** juntas de painel geométricas, 64 rebites instanciados, suíte de sensores EO/IR com tubos pitot, antenas, persianas de exaustão, estatores no intake dos pods e no EDF, pétalas de bocal, trem de pouso retrátil, decalques de resgate e registro.
- **Sinalização aeronáutica:** luzes de navegação vermelha/verde com duplo strobe, farol anticolisão pulsante e luzes de aproximação na pista externa.
- **Herança Mk.III/Mk.IV mantida:** casco paramétrico (comprimento, boca, altura), modo Engenharia com vetores de força em kN, cotas 3D, telemetria SI e solver determinístico em `src/physics.js`.

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

Para inspecionar o ambiente pelo console do navegador, `window.__AURORA_DEBUG__.snapshot()` devolve o estado corrente da cena — visibilidade de hangar/campo, intensidade do sol, luminárias acesas, neblina, exposição e mapa de ambiente ativo.
