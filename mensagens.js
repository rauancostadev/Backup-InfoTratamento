/* =====================================================================
   mensagens.js • Mensagens prontas padrão (base do sistema)
   Usado por anotacoes.html (exibição) e painel.html (edição pela gestão).

   GROUPS: categorias e seus botões (id + rótulo)
   TEXTOS: o texto de cada mensagem (a chave é o id). *texto* vira negrito no WhatsApp.
   META:   ícone e cor de cada categoria.
   ===================================================================== */
const GROUPS = [
 {
  "title": "Saudações",
  "items": [
   {
    "id": "bomdia",
    "label": "Bom Dia"
   },
   {
    "id": "boatarde",
    "label": "Boa Tarde"
   },
   {
    "id": "boanoite",
    "label": "Boa Noite"
   }
  ]
 },
 {
  "title": "Informações",
  "items": [
   {
    "id": "entradaregula",
    "label": "Passo a Passo do Regula"
   },
   {
    "id": "preencherinfopaciente",
    "label": "Preencher Informações do Paciente"
   },
   {
    "id": "solicitacao",
    "label": "Solicitação da Triagem"
   },
   {
    "id": "hematologiaunimed",
    "label": "Hematologia Unimed"
   },
   {
    "id": "hematonaoautorizado",
    "label": "Hematologia Não Autorizada"
   },
   {
    "id": "solicitarpendencia",
    "label": "Solicitar Pendência"
   }
  ]
 },
 {
  "title": "Contatos",
  "items": [
   {
    "id": "contatosecretariasus",
    "label": "Secretária SUS"
   },
   {
    "id": "contatosecretariaconv",
    "label": "Secretária Convênio"
   },
   {
    "id": "secretariaradio",
    "label": "Secretária Radio"
   },
   {
    "id": "secretariatelefonia",
    "label": "Secretária pela Telefonia"
   },
   {
    "id": "contatoquimioterapiasus",
    "label": "Contato Quimioterapia SUS"
   },
   {
    "id": "contatoquimioterapiaconvenio",
    "label": "Contato Quimioterapia Convênio"
   },
   {
    "id": "contatopediatria",
    "label": "Contato Pediatria"
   },
   {
    "id": "contatocentraldemarcaçao",
    "label": "Contato Central de Marcação"
   },
   {
    "id": "semvagaradio",
    "label": "Radioterapia Sem Vagas"
   }
  ]
 },
 {
  "title": "Valores de Consultas",
  "items": [
   {
    "id": "consultahematologia",
    "label": "Valor Consulta Hematologia"
   },
   {
    "id": "consultaoncologia",
    "label": "Valor Consulta Oncologia"
   },
   {
    "id": "consultaradio",
    "label": "Valor Consulta Radioterapia"
   },
   {
    "id": "consultaoncogenetica",
    "label": "Valor Consulta Oncogenética"
   }
  ]
 },
 {
  "title": "Informações 1ª Vez",
  "items": [
   {
    "id": "hematoconvenio",
    "label": "Hematologia Convênio"
   },
   {
    "id": "hematosus",
    "label": "Hematologia SUS"
   },
   {
    "id": "hematoparticular",
    "label": "Hematologia Particular"
   },
   {
    "id": "oncoconvenio",
    "label": "Oncologia Convênio"
   },
   {
    "id": "oncosus",
    "label": "Oncologia SUS"
   },
   {
    "id": "oncoparticular",
    "label": "Oncologia Particular"
   },
   {
    "id": "radioconvenio",
    "label": "Radioterapia Convênio"
   },
   {
    "id": "radiosus",
    "label": "Radioterapia SUS"
   },
   {
    "id": "radioparticular",
    "label": "Radioterapia Particular"
   }
  ]
 },
 {
  "title": "Preparos das Consultas",
  "items": [
   {
    "id": "consultasustratamento",
    "label": "Consulta SUS - Tratamento"
   },
   {
    "id": "consultasusinterior",
    "label": "Consulta SUS - Interior"
   },
   {
    "id": "consultasusnatal",
    "label": "Consulta SUS - Natal"
   },
   {
    "id": "consultaparticular",
    "label": "Consulta Particular"
   },
   {
    "id": "consultaconvenio",
    "label": "Consulta Convênio"
   }
  ]
 },
 {
  "title": "Finalizar atendimento",
  "items": [
   {
    "id": "agendamentofeito",
    "label": "Agendamento Realizado"
   },
   {
    "id": "finalizandoexpediente",
    "label": "Finalizando Expediente"
   },
   {
    "id": "agradecimentonasemana",
    "label": "Agradecer na Semana"
   },
   {
    "id": "agradecimentofinaldesemana",
    "label": "Agradecer Final de Semana"
   }
  ]
 }
];
const TEXTOS = {
    bomdia: `Bom dia!
Me chamo Rauan, atendente nas especialidades de Oncologia Clínica e Hematologia pela unidade de Natal.

Para iniciarmos, me informe seu nome e se a consulta seria por convênio, particular ou pelo SUS?`,

    boatarde: `Boa tarde!
Me chamo Rauan, atendente nas especialidades de Oncologia Clínica e Hematologia pela unidade de Natal.

Para iniciarmos, me informe seu nome e se a consulta seria por convênio, particular ou pelo SUS?`,

    boanoite: `Boa noite!
Me chamo Rauan, atendente nas especialidades de Oncologia Clínica e Hematologia pela unidade de Natal.

Para iniciarmos, me informe seu nome e se a consulta seria por convênio, particular ou pelo SUS?`,

    solicitacao: `Muito obrigado! Segue abaixo as orientações:

*As informações foram encaminhadas ao setor responsável para ser realizada a triagem.* ✅

- Favor aguardar a análise do médico.
- Após a análise, retornaremos o contato sobre a liberação da consulta.

Obs: Caso ultrapasse o prazo de 72h úteis e não tivermos mantido contato com o paciente, favor nos contate imediatamente.`,

    agendamentofeito: `*Confirmado o agendamento* ✅

Teria dúvidas ou posso lhe ajudar em algo mais? 😊`,

    agradecimentonasemana: `Meus agradecimentos e lhe desejo uma ótima e abençoada semana! 🙏`,

    agradecimentofinaldesemana: `Meus agradecimentos e lhe desejo um ótimo e abençoado final de semana! 🙏`,

    preencherinfopaciente: `*Favor preencher as seguintes informações:*
 
- *Nome completo:* 
- *CPF:* 
- *Data de nascimento:* 
- *Número de telefone:* 

- *Foi sugerido algum médico?*`,

    contatosecretariaconv: `Vitória ou Jéssica
*(84) 99413-9912* - Secretária da Oncologia/Hematologia Convênio (WhatsApp)

Segunda a sexta
*Horário de atendimento:* 07:00 às 17:00`,

    contatosecretariasus: `*(84) 4009-5573* - Secretária da Oncologia/Hematologia SUS (Apenas via Ligação)

Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

    contatoquimioterapiasus: `*(84) 4009-5583* - Quimioterapia SUS (Apenas via WhatsApp)

Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

    contatoquimioterapiaconvenio: `*(84) 98843-3323* - Quimioterapia Convênio (Apenas via WhatsApp)

Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

    hematonaoautorizado: `O motivo do meu contato é a respeito da solicitação da triagem, os exames foram apresentados aos médicos hematologista e a consulta não foi liberada.

Por sermos um hospital voltado ao diagnóstico de neoplasias malignas, a triagem realizada não identificou achados sugestivos de malignidade.

Contamos com a sua compreensão e qualquer dúvida, pode retornar o contato conosco, estamos à disposição.`,

    solicitarpendencia: `ENCAIXE

NOME: 
CPF: 
CTT: 

Motivo: `,

    contatopediatria: `Atendimento do setor pediátrico via WhatsApp:
*(84) 4009-5501*
Selecionar a opção 5 - Hospital Pediatria

Ou via ligação, através do número:
*(84) 4009-5688* - Pediatria

Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

    contatocentraldemarcaçao: `Atendimento via WhatsApp: 
*(84) 4009-5601*
Preencher as informações e ao solicitar a especialidade escrever "Cirurgião Oncológico"

Ou via ligação, através do número:
*(84) 4009-5600* - Central de Marcação

Segunda a sexta
*Horário de atendimento:* 07:00 às 18:00`,

    entradaregula: `*Segue o passo a passo para dar entrada na autorização:*

1º Passo: Se dirigir na secretaria de saúde do município, portando o documento pessoal com foto e CPF.
2º Passo: Solicitando inserir a consulta, informando a especialidade, nome do médico e os dados do paciente.
3º Passo: Aguardar 20 dias. Após o prazo, retorne o contato conosco para liberarmos a autorização.

Caso a secretaria de saúde tenha dúvidas, favor, manter contato diretamente com a Sesap/RN e serão orientados.`,

    secretariatelefonia: `*Setor de Telefonia:*
Entrar em contato via ligação através do número *(84) 4009-5501*, selecionar a *opção 9* para falar com o setor de *telefonia* e em seguida, solicitar falar com a secretária
 
Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

    finalizandoexpediente: `Estamos finalizando as nossas operações de atendimento e contamos com sua compreensão.
    
Favor nos contatar amanhã para darmos continuidade ao atendimento. Tenha uma ótima noite!`,

    secretariaradio: `*(84) 4009-5575* - Secretária Radioterapia (Apenas via Ligação)
*(84) 4009-7433* - Secretária Radioterapia (Apenas via Ligação)

Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

   consultasustratamento: `*ATENÇÃO:* Paciente deverá chegar 30 minutos antes para registrar o atendimento e receber as informações necessárias para realização deste procedimento.
   
*Paciente deverá trazer no dia da consulta:*  
- Documentos pessoais, comprovante de residência em seu nome, cartão do SUS atualizado do município em que reside, encaminhamento/ficha de referência e exames anteriores, caso tenha.

*Observação:* Não precisa solicitar a autorização para esta consulta, pois o paciente segue em tratamento.`,

    consultasusnatal: `*ATENÇÃO:* Paciente deverá chegar 30 minutos antes para registrar o atendimento e receber as informações necessárias para realização deste procedimento.
    
*Paciente deverá trazer no dia da consulta:*  
- Documentos pessoais, comprovante de residência em seu nome, cartão do SUS atualizado do município de Natal, encaminhamento/ficha de referência e exames anteriores, caso tenha.`,

    consultasusinterior: `*ATENÇÃO:* Paciente deverá chegar 30 minutos antes para registrar o atendimento e receber as informações necessárias para realização deste procedimento.

*Paciente deverá trazer no dia da consulta:*  
- Documentos pessoais, comprovante de residência em seu nome, cartão do SUS atualizado do município em que reside, encaminhamento/ficha de referência e exames anteriores, caso tenha.`,

    consultaconvenio: `*ATENÇÃO:* Paciente deverá chegar 30 minutos antes para registrar o atendimento e receber as informações necessárias para realização deste procedimento.
    
*Paciente deverá trazer no dia da consulta:*  
- Documentos pessoais e exames anteriores para mostrar (caso tenha);
- Carteira do Convênio.

*Observação:* Não esquecer de agendar o seu retorno após a consulta.`,

    consultaparticular: `*ATENÇÃO:* Paciente deverá chegar 30 minutos antes para registrar o atendimento e receber as informações necessárias para realização deste procedimento.
    
*Paciente deverá trazer no dia da consulta:*  
- Documentos pessoais e exames anteriores para mostrar (caso tenha);

*Observação:* Não esquecer de agendar o seu retorno após a consulta.`,

    consultaoncologia: `A consulta oncologista clínico tem o valor de R$ 450,00, pode parcelar em até 6 vezes, sem juros no cartão de crédito, com direito a um retorno de até 30 dias`,

    consultahematologia: `A consulta hematologista tem o valor de R$ 450,00, pode parcelar em até 6 vezes, sem juros no cartão de crédito, com direito a um retorno de até 45 dias`,

    consultaradio: `A consulta radioterapeuta tem o valor de R$ 250,00, pode parcelar em até 4 vezes, sem juros no cartão de crédito, com direito a um retorno de até 30 dias`,

    consultaoncogenetica: `A consulta oncogeneticista tem o valor de R$ 500,00, pode parcelar em até 6 vezes, sem juros no cartão de crédito, com direito a um retorno de até 30 dias`,
      
    hematologiaunimed: `*Hematologia para adultos, convênio Unimed:*
Não atende gestantes;
É priorizado os pacientes oncológicos.

Para passar pela triagem, se faz necessário nos enviar via WhatsApp:
*Resultado do hemograma e o encaminhamento médico, caso tenha.*

Encaminharemos a solicitação da triagem, a médica avaliará e retornaremos o contato para informar sobre a liberação da consulta.`,

    semvagaradio: `Estamos sem vagas disponíveis, os agendamentos foram disponibilizados até o mês de agosto, porém todas as vagas já foram preenchidas.

Em casos de urgências ou mostrar exames, poderá vir presencialmente na unidade do CECAN ou manter contato *via WhatsApp* com a secretária da radioterapia, através do número *(84) 4009-5581.*

Segunda a sexta
*Horário de atendimento:* 08:00 às 16:00`,

    hematoconvenio: `Atendimentos por convênio com a hematologia, se faz necessário passar por uma triagem. Favor nos enviar por este canal de WhatsApp o resultado do *hemograma* ou *biópsia* e, caso tenha, o *encaminhamento médico*. Após a análise dos médicos, a consulta poderá ser liberada.`,
    hematosus: `Atendimentos pelo SUS com a hematologia, se faz necessário passar por uma triagem. Favor nos enviar por este canal de WhatsApp o resultado da *biópsia* ou *hemograma* e, caso tenha, o *encaminhamento médico*. Após a análise dos médicos, a consulta poderá ser liberada.`,
    hematoparticular: `A consulta hematologista tem o valor de R$ 450,00, pode parcelar em até 6 vezes e o paciente tem direito ao retorno de até 45 dias`,
      
    oncoconvenio: `Atendimentos por convênio com a oncologia clínica, se faz necessário passar por uma triagem. Favor nos enviar por este canal de WhatsApp o resultado dos *exames de imagem* ou *biópsia* e, caso tenha, o *encaminhamento médico*. Após a análise dos médicos, a consulta poderá ser liberada.`,
    oncosus: `Atendimentos pelo SUS com a oncologia clínica, se faz necessário passar por uma triagem. Favor nos enviar por este canal de WhatsApp o resultado da *biópsia* e, caso tenha, o *encaminhamento médico*. Após a análise dos médicos, a consulta poderá ser liberada.`,
    oncoparticular: `Atendimentos via particular com a oncologia clínica, se faz necessário passar por uma triagem. Favor nos enviar por este canal de WhatsApp o resultado dos *exames de imagem* ou *biópsia* e, caso tenha, o *encaminhamento médico*. Após a análise dos médicos, a consulta poderá ser liberada.`,
      
    radioconvenio: `Atendimentos por convênio com a radioterapia, se faz necessário nos enviar via WhatsApp o resultado da *biópsia* e *encaminhamento médico* para passar pela triagem. Após a análise dos médicos, a consulta poderá ser liberada.`,
    radiosus: `Atendimentos pelo SUS com a radioterapia, se faz necessário nos enviar via WhatsApp o resultado da *biópsia* e *encaminhamento médico* para passar pela triagem. Após a análise dos médicos, a consulta poderá ser liberada.`,
    radioparticular: `Solicitar no grupo de 1ª vez da radioterapia, portando apenas o *encaminhamento médico*.`
  };

const META = {
  'Saudações':              { ico:'👋', c:'#1a4f88' },
  'Informações':            { ico:'ℹ️', c:'#00838f' },
  'Contatos':               { ico:'📞', c:'#CC5500' },
  'Valores de Consultas':   { ico:'💰', c:'#2e7d32' },
  'Informações 1ª Vez':     { ico:'🆕', c:'#6a1b9a' },
  'Preparos das Consultas': { ico:'🎒', c:'#c2185b' },
  'Finalizar atendimento':  { ico:'✅', c:'#455a64' }
};

/* ---------- junção da base com o que a gestão ajustou (guardado no banco) ---------- */
const Msgs = (function () {
  const BASE_GROUPS = JSON.parse(JSON.stringify(GROUPS));
  const BASE_TEXTOS = Object.assign({}, TEXTOS);
  const BASE_IDS = new Set(BASE_GROUPS.flatMap(g => g.items.map(i => i.id)));
  const PALETA = ['#1a4f88', '#00838f', '#CC5500', '#2e7d32', '#6a1b9a', '#c2185b', '#455a64'];

  /* só a base, sem nenhum ajuste (é o que o visitante vê) */
  function base() {
    return BASE_GROUPS.map(g => ({ title: g.title, items: g.items.map(i => ({ id: i.id, label: i.label, text: BASE_TEXTOS[i.id] || '' })) }));
  }
  /* base + ajustes da gestão. shared = { id: { grupo, titulo, texto, oculta, atualizado } } */
  function model(shared) {
    const groups = base();
    const gOf = t => {
      let g = groups.find(x => x.title === t);
      if (!g) { g = { title: t, items: [] }; groups.push(g); if (!META[t]) META[t] = { ico: '💬', c: PALETA[groups.length % PALETA.length] }; }
      return g;
    };
    Object.values(shared || {}).sort((a, b) => (a.atualizado || 0) - (b.atualizado || 0)).forEach(d => {
      const isBase = BASE_IDS.has(d.id);
      let from = null, it = null;
      groups.forEach(g => { const k = g.items.findIndex(x => x.id === d.id); if (k > -1) { from = g; it = g.items[k]; } });
      if (d.oculta) { if (from) from.items.splice(from.items.indexOf(it), 1); return; }
      if (isBase && it) {
        it.label = d.titulo; it.text = d.texto; it.over = true;
        if (d.grupo && d.grupo !== from.title) { from.items.splice(from.items.indexOf(it), 1); gOf(d.grupo).items.push(it); }
      } else gOf(d.grupo || 'Compartilhadas').items.push({ id: d.id, label: d.titulo, text: d.texto, novo: true });
    });
    return groups.filter(g => g.items.length);
  }
  return { BASE_GROUPS, BASE_TEXTOS, BASE_IDS, base, model };
})();
