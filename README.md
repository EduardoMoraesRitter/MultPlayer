# Jogo de Discos 3D (Estilo Tron)

Um jogo multiplayer 3D onde os jogadores lançam discos de luz que ricocheteiam nas paredes. Construído com React Three Fiber, Rapier (motor de física) e Zustand.

## Documentação de Correções e Lógicas

### O Problema do Ricochete nas Paredes (Física)

**O que estava acontecendo:**
Quando o jogador atirava o disco contra uma parede, em vez de quicar (fazer tabela), o disco batia na parede e voltava imediatamente para a mão do jogador.

**Qual era a causa:**
O motor de física que usamos (`@dimforge/rapier3d-compat`) possui diferentes funções para lançar raios (Raycasting) e detectar colisões:
- `world.castRay`: Retorna apenas **onde** o raio bateu e em **qual objeto** (distância/tempo de impacto).
- `world.castRayAndGetNormal`: Retorna as informações acima e também o **vetor normal** (a direção exata para a qual a superfície atingida está apontando).

Como estávamos usando apenas `castRay`, a variável `hit.normal` ficava vazia (`undefined`). Sem saber a inclinação da parede, a matemática do ricochete não tinha como calcular o ângulo de saída, e o código acionava a regra de "devolver o disco para o dono".

**A Solução:**
1. Trocamos a função de detecção para `world.castRayAndGetNormal(ray, moveDist, true)`.
2. Com o vetor normal (`n`) em mãos, usamos a função matemática `dir.current.reflect(n)` para calcular o ângulo exato do quique.
3. Adicionamos um pequeno empurrão para longe da parede (`pos.current.addScaledVector(n, 0.2)`) logo após o impacto. Isso evita um bug de "auto-interseção" onde o disco ficava preso milimetricamente "dentro" da parede no frame seguinte, o que fazia o jogo contar 3 batidas falsas na mesma parede em uma fração de segundo.

## Prompt Completo para Replicação (Engenharia de Prompt)

Se você quiser recriar este projeto do zero em outra IA ou ambiente, copie e cole o prompt abaixo:

---

**Prompt:**

```text
Atue como um Desenvolvedor Sênior de Jogos Web 3D, especialista em React, TypeScript, React Three Fiber (R3F), @react-three/drei, Zustand e Rapier (motor de física).

Sua tarefa é criar um jogo multiplayer 3D de arena inspirado em "Tron", onde os jogadores lançam discos de luz que ricocheteiam nas paredes. 

**Stack Tecnológico:**
- Frontend: Vite, React, TypeScript, Tailwind CSS.
- 3D & Física: @react-three/fiber, @react-three/drei, @dimforge/rapier3d-compat (ou @react-three/rapier).
- Estado: Zustand.
- Multiplayer: Socket.io-client (com um servidor Node.js/Express/Socket.io básico).

**Mecânicas Principais:**
1. **Arena:** Uma arena fechada com chão escuro, paredes com bordas de neon (bloom/glow) e obstáculos geométricos espalhados.
2. **Movimentação:** O jogador controla a câmera em primeira pessoa (PointerLockControls) e se move usando WASD.
3. **Lançamento de Discos:**
   - Ao clicar com o mouse, o jogador lança um disco brilhante na direção da câmera.
   - O disco viaja em linha reta usando Raycasting contínuo para detectar colisões antes de atravessar paredes (tunneling).
   - **Física do Ricochete:** Use `world.castRayAndGetNormal` do Rapier para detectar a colisão. Quando o disco bater em uma parede, pegue o vetor normal (`hit.normal`), calcule o ângulo de reflexão (`dir.reflect(normal)`) e adicione um pequeno offset (`pos.addScaledVector(normal, 0.2)`) para evitar que o disco fique preso na parede.
   - O disco pode quicar no máximo 3 vezes. Após o 3º quique, ou se atingir um jogador/bot, ele entra no estado "returning" e volta suavemente para a mão do dono.
4. **Multiplayer & Estado:**
   - Sincronize a posição e rotação dos jogadores via WebSockets.
   - Sincronize o lançamento de discos (quem lançou, posição inicial, direção e cor).
   - Use Zustand para gerenciar o estado local (jogadores conectados, discos ativos, pontuação).
5. **Bots (Opcional):**
   - Adicione bots simples que se movem aleatoriamente pela arena e lançam discos na direção do jogador mais próximo.
6. **Visual:**
   - Estilo Cyberpunk/Tron. Cores escuras de fundo (#050510), grades de neon no chão (Grid helper), e uso do componente `<EffectComposer>` com `<Bloom>` do `@react-three/postprocessing` para fazer os discos e as bordas das paredes brilharem.

Por favor, forneça a estrutura de pastas e os códigos completos para o servidor (server.ts) e para o frontend (App.tsx, store, componentes da arena, jogador e efeitos do disco).
```
---
