# Leilão de Futebol - Correção de Início Simultâneo

## O que foi corrigido:
- **Redirecionamento Simultâneo ao Iniciar Leilão (`sala.js` e `leilao.js`)**:
  - Antes, o anfitrião mudava para `leilao.html` rápido demais e encerrava a conexão antes que o sinal `start` chegasse aos convidados.
  - Agora, ao clicar em **Iniciar leilão**, o anfitrião marca `state.started = true`, envia o comando de início repetidas vezes por 800ms antes de navegar e os convidados possuem verificação contínua (`ping`) + auto-reconexão resiliente na entrada de `leilao.html`. Todos entram juntos no leilão!
