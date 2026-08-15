# AURORA GT/2 — Mk.V

Uma experiência WebGL de engenharia especulativa para a cápsula AURORA GT/2. A Mk.V substitui o visual ilustrado das iterações anteriores por renderização fisicamente coerente: microsuperfícies PBR procedurais, um hangar 3D completo ao redor da aeronave e reflexos gerados a partir do próprio ambiente.

A cena abre **de dia**: o seletor de ambiente permite alternar entre hangar e campo aberto e entre luz diurna e noturna, com iluminação, atmosfera e reflexos recalculados para cada combinação.

> A aeronave, o Gravium-7 e sua arquitetura de propulsão são ficcionais. O balanço de peso, sustentação equivalente, tração, arrasto e aceleração usa mecânica clássica, teoria de disco atuador e, no modo **Impulso de fusão**, a equação do foguete aplicada a um reator de deutério (D+D).

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
- **Modo Impulso de fusão (novo):** no painel de Engenharia, o seletor **Sistema propulsivo** alterna o EDF elétrico (disco atuador) para um **impulso de fusão** (`src/fusionDrive.js`), que modela exaustão de plasma com a equação do foguete — empuxo `F = ṁ·Vₑ`, potência de jato `P = ½ṁ·Vₑ²`, impulso específico `Isp = Vₑ/g`, queima `t = m_prop/ṁ` e `Δv = Vₑ·ln(m₀/m_f)`. O **combustível é selecionável**: **D+D (deutério)** ou **D+³He (hélio-3)** — o ³He é ~4× mais energético e quase anêutronico.
- **Missão orbital ponto a ponto (novo):** `src/orbital.js` planeja o salto balístico mínimo entre dois pontos da Terra (elipse kepleriana, `v_inj`, apogeu, tempo por Kepler e deutério consumido), usado apenas na fase exoatmosférica — com indicador de viabilidade e alcance máximo do tanque.
- **Órbita circular · escape (novo):** o mesmo módulo calcula `v_orb`, período e `v_esc = √2·v_orb` em qualquer altitude, com o Δv de injeção e o deutério exigido — evidenciando honestamente que o tanque atual (≈3,2 km/s) alcança o salto ponto a ponto, mas **não** a órbita baixa (~9 km/s).
- **Reator · confinamento e blindagem (novo):** `src/thermalProtection.js` modela a "garrafa invisível" — confinamento magnético (REBCO 20 T, `B²/2μ₀`), primeira parede de tungstênio (margem ao melt), radiadores por Stefan–Boltzmann (T⁴) e blindagem leve de nêutrons (D+³He quase anêutronico).

## Modelo físico

O solver usa:

- peso: `W = m·g`;
- arrasto: `D = ½ρV²CdA`;
- disco atuador: `P = 2ρA·vi·(V + vi)²` e `T = 2ρA·vi·(V + vi)`;
- dinâmica: `a = ΣF / m`;
- geometria: volume exato de um elipsoide e aproximação de Knud Thomsen para a área molhada.

A velocidade induzida do disco atuador é encontrada por bisseção estável, inclusive em velocidade de avanço zero. A autonomia exibida é a razão ideal entre a energia nominal e a potência instantânea, sem reserva ou perdas auxiliares.

## Impulso de fusão (D+D) — física real, não magia

O "impulso" de Star Trek é, na mecânica clássica, um **foguete de fusão**: o reator fíde deutério e o bocal expele um plasma a alta velocidade. A física disso é real e é a da **equação do foguete** (`src/fusionDrive.js`):

- **Energia dos combustíveis:**
  - **D + D** → libera ≈ 3,6 MeV/reação (2 deutérios) ⇒ ≈ **8,6×10¹³ J/kg** (≈ 1,9 milhão × gasolina), exaustão ideal ≈ **4,4% c** (`Isp ≈ 1,3×10⁶ s`). Emite nêutrons ⇒ blindagem pesada.
  - **D + ³He** → libera ≈ 18,4 MeV/reação ⇒ ≈ **3,5×10¹⁴ J/kg** (**~4× o D+D**), exaustão ideal ≈ **8,9% c** (`Isp ≈ 2,7×10⁶ s`). **Quase anêutronico** (energia em partículas carregadas ⇒ jato direto, menos blindagem). A desvantagem é a escassez: ³He é raríssimo na Terra — fonte prática é mineração lunar/atmosfera de gigantes gasosos (a premissa de Star Trek).
- **Limite ideal:** o valor acima é o teto teórico se toda a energia fosse para o próprio combustível — não é meta de projeto.
- **Regime prático:** um impulso real adiciona **massa de reação** ao plasma. A uma `Vₑ` menor (ex.: 35 km/s), o empuxo cresce às custas do `Isp` — a troca clássica "empuxo × impulso específico" a potência de jato fixa (`F = 2P_j/Vₑ`).
- **No AURORA (padrão):** reator de ≈ 12 MW de jato, `Vₑ ≈ 35 km/s`, `Isp ≈ 3.570 s`, fluxo de massa ≈ 7 g/s, 120 kg de massa de reação ⇒ ≈ 4,5 h de queima e `Δv ≈ 3,2 km/s`. O combustível de fusão em si é quase desprezível (gramas/hora; com D+³He ainda menos). A escolha de combustível afeta a densidade de energia e a blindagem, **não** o `Isp`/`Δv` de projeto — que dependem da `Vₑ` de exaustão escolhida.

### É "totalmente possível na realidade"?

**A física do exaustão de plasma a partir de fusão de deutério é real.** A parte **ficcional** de Star Trek não é a propulsão — são três infraestruturas que ainda não existem em escala de aeronave pessoal:

1. **Reator de fusão compacto:** um reator de 12 MW ainda não cabe em 4,8 m de cápsula; reatores reais (tokamak, stellarator, inércia) são instalações do tamanho de prédios. O campo está ativo (ICF/MTF, fusão por confinamento inercial e magnético), mas a densidade de potência por massa ainda está longe do necessário.
2. **Blindagem e radiação:** fusão D+D produz nêutrons; a blindagem pesa e é obrigatória para tripulação. Amortecedores e escudos de campo ainda são ciência futura.
3. **Equilíbrio empuxo × combustível:** para decolar da superfície (empuxo alto, `T/P > 1`) você precisa de baixo `Isp` e muito fluxo de massa — por isso, no modelo, a **sustentação atmosférica continua no disco atuador** (rotor/EDF) e o impulso de fusão é o regime de **alta velocidade / saída orbital**, exatamente como na série.

Ou seja: dá para modelar e calcular com rigor — e o projeto faz isso —, mas "aplicar" num veículo pessoal hoje esbarra no reator compacto e na blindagem, não na equação do foguete.

### A "garrafa invisível": confinamento e blindagem térmica do reator

O plasma D+³He queima a ~150 milhões de °C — nenhum material sólido sobrevive em contato. A proteção não é um metal resistente, mas sim **quatro sistemas** (`src/thermalProtection.js`, modelados no painel em **Reator · confinamento e blindagem**):

1. **Garrafa magnética (ímãs supercondutores REBCO):** um campo de **20 T** gera pressão magnética `B²/2μ₀ ≈ 1570 atm`, suficiente para conter ~**80 atm de plasma** (β = 5%) sem tocar as paredes. O plasma fica "flutuando", preso pelo magnetismo.
2. **Primeira parede de tungstênio:** mesmo confinado, o plasma irradia calor. A **~10 MW/m²** de fluxo no divertor, o tungstênio chega a ~1.200 °C — com **>2.000 °C de margem** antes de derreter (3.422 °C). Compósitos de carbono/grafeno espalham o calor.
3. **Radiadores de alta temperatura:** no vácuo o calor só sai por radiação, que escala com **T⁴** (Stefan–Boltzmann). Rejeitar 3,4 MW exige **~8.200 m² a 300 K** (inviável) mas só **~100 m² a 900 K** — por isso radiadores quentes são essenciais.
4. **Blindagem de nêutrons leve:** D+³He é quase anêutronico — só ~1–3% da potência sai como nêutrons (ramo D–D). A blindagem é de **~1,5 t** (LiH/boro), muito menor que o cofre que um reator D+D exigiria.

**Proteção da tripulação:** piloto na **frente, longe do reator** (a radiação cai com o inverso do quadrado da distância), blindagem de sombra + escudo de nêutrons, e refrigeração a **hélio líquido** mantendo a cabine confortável. O calor residual é rejeitado pelos radiadores de alta temperatura — é por isso que a cápsula precisa deles grandes e quentes.

**No modelo 3D (aplicado na cápsula):** ao selecionar o **Impulso de fusão** no painel, o reator D+³He aparece **fisicamente no modelo** — bobinas REBCO (garrafa magnética), primeira parede de tungstênio com anéis quentes, plasma confinado incandescente, radiadores de alta temperatura e a blindagem de nêutrons entre o reator e a cabine. O halo do plasma pulsa e as bobinas giram em tempo real.

### Missão orbital · ponto a ponto (uso recomendado do impulso)

Como o impulso de fusão tem **empuxo baixo e Isp alto**, ele não compete com o arrasto atmosférico — o lugar certo é a **transferência exoatmosférica**. No painel de Engenharia, em modo **Impulso de fusão**, a seção **"Missão orbital · ponto a ponto (Terra)"** (`src/orbital.js`) planeja o salto balístico entre dois pontos do planeta:

- **Arquitetura:** a subida e o pouso (atmosfera) ficam com o **EDF**; o impulso de fusão faz só o arco de transferência — trajetória balística mínima (elipse kepleriana com a Terra no foco, pontos simétricos ao apogeu).
- **Física:** `v_inj = sqrt(2μ·sin(β/2)/(R·(1+sin(β/2))))`, tempo de voo por Kepler (anomalia média), apogeu `a(1+e)` e propelente pela equação do foguete `m_prop = m_dry(e^{Δv/Vₑ}−1)`.
- **Resultado honesto:** com os 120 kg de deutério e `Vₑ ≈ 35 km/s`, um salto de **~8,3° (~930 km)** drena todo o tanque em **~8 min** com apogeu de ~220 km. Um salto transatlântico (por exemplo 5.000 km) **não cabe** no orçamento atual — o painel mostra isso como "não viável" e informa o alcance máximo.

O controle **Alcance desejado** desliza de 50 a 3.000 km; a telemetria mostra ângulo central, velocidade de injeção, apogeu, tempo de voo e deutério consumido, com indicador de viabilidade.

### Órbita circular · velocidade de escape (por que o impulso não "sai para a órbita" facilmente)

A seção **"Órbita circular · escape"** (`src/orbital.js`) modela o regime de injeção orbital: `v_orb = √(μ/(R+h))`, período `2π(R+h)/v_orb` e velocidade de escape `v_esc = √2·v_orb`.

- **Resultado honesto:** órbita baixa (LEO, ~7,3–7,7 km/s) somada a ~1,4 km/s de perdas de gravidade/arrasto dá um Δv total de **~9 km/s**. Com os 120 kg de deutério o impulso de fusão entrega apenas **~3,2 km/s** — ou seja, **não é viável alcançar a órbita da Terra com o tanque atual** (exigiria ~360 kg de deutério). O painel mostra isso explicitamente.
- **Contraste físico importante:** a mesma capacidade que faz um salto ponto a ponto de ~930 km não alcança órbita — porque o salto é suborbital (∆v ≤ ~3,2 km/s), enquanto órbita exige o dobro de velocidade **e** circularização. É exatamente por isso que Star Trek usa o impulso para manobrar perto de planetas e o motor de dobra para viajar entre eles.
- **Velocidade de escape** (≈11,2 km/s na superfície, √2× a orbital) também é mostrada; alcançá-la é ainda mais exigente.

Além do painel, os controles de **Altitude-alvo** (150–36.000 km) deixam claro o perfil: a injeção orbital varia pouco com a altitude (≈7,3–7,9 km/s em todo o LEO), então a conclusão "não viável com o tanque atual" se mantém em toda a faixa.

## Testes

```bash
npm test
```

A suíte cobre peso em SI, lei quadrática do arrasto, resposta do disco atuador à potência, consistência força/aceleração, impacto da geometria paramétrica e limites de entrada. Em `tests/fusionDrive.test.mjs` também valida a física do impulso de fusão: energia do deutério, energia e caráter anêutronico do D+³He, relações `F = ṁ·Vₑ` e `P = ½ṁ·Vₑ²`, troca empuxo × `Isp`, queima, `Δv` e o acoplamento do solver (`propulsionModel: 'fusion'`). Em `tests/orbital.test.mjs` valida a missão ponto a ponto (relação alcance × ângulo central, injeção sempre abaixo da velocidade orbital, equação de Tsiolkovsky, viabilidade e alcance máximo) e o regime orbital/escape (`v_esc = √2·v_orb`, injeção de LEO inviável com o tanque atual, consistência da equação do foguete para tanques maiores). Em `tests/thermalProtection.test.mjs` valida o confinamento magnético (`B²/2μ₀`), a margem térmica da primeira parede de tungstênio, a lei T⁴ dos radiadores e a blindagem leve de nêutrons do D+³He.

Para inspecionar o ambiente pelo console do navegador, `window.__AURORA_DEBUG__.snapshot()` devolve o estado corrente da cena — visibilidade de hangar/campo, intensidade do sol, luminárias acesas, neblina, exposição e mapa de ambiente ativo.
