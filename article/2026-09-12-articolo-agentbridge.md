# Non è che scrive kubectl più veloce di te (anche se lo fa)

*Una giornata di lavoro su Kubernetes con il tuo AI agent dentro Freelens.*

![placeholder: sidebar di Freelens con AgentBridge e una sessione aperta](TODO-immagine-1.png)

## Il costo nascosto non sono i comandi

Alert alle 9:40: un servizio della pipeline documentale ha smesso di processare qualsiasi cosa.

Prima di fare qualcosa di utile devi rispondere a quattro domande che non
parlano di Kubernetes: quale cluster, quale namespace, chi chiama chi in quella
pipeline, e cosa ti ricordi dell'ultima volta che quella pipeline si è rotta. Le prime tre risposte le hai in
testa, la quarta è sepolta in un chat Teams di tre mesi fa.

I comandi in questo caso (e nella maggior parte direi) sono l'ultima parte del problema. 
Quello che costa davvero è il contesto.

Un agente che sa scrivere `kubectl` ti fa risparmiare la parte piccola. Un
agente che parte già sapendo dove si trova, cosa è successo 3 mesi fa e quali sono i problemi comuni del cluster
ti fa risparmiare il resto; questa è la differenza tra un terminale con un'AI dentro e un ambiente di lavoro 
in cui l'AI ha memoria, contesto e visibilità sull'ambiente (ormai lo chiamiamo harness o agent workspace).

## Due parole su cos'è un agent workspace

Un terminale con un coding agent dentro è senza stato: apri, chiedi, chiudi, e la
volta dopo riparti da zero. La memoria del contesto resta tutta tua.

Un *agent harness* è l'opposto: lanci il tuo agent all'interno di una folder; 
dentro c'è tutto il suo harness, cioè l'insieme di cose che gli
dicono come comportarsi, cosa sa e cosa può fare. L'harness è tutto l'insieme di artefatti, files,
software e tools che vivono "attorno" al tuo agente, ti elenco alcuni componenti che potresti avere nel tuo harness:

- **Hot memory.** Il file di istruzioni letto a ogni inizio sessione:
  `AGENTS.md`, `CLAUDE.md`, `copilot-instructions.md`. Regole stabili,
  convenzioni, avvertenze. Deve restare corto perchè sempre nel contesto.
- **Permessi.** Il file che dice cosa l'agente può fare senza chiedere: quali
  comandi passano da soli, quali si fermano in attesa di un sì. È il confine tra
  autonomia e controllo (spoiler: è uno dei file che AgentBridge ti prepara in
  anticipo).
- **Memoria a lungo termine.** Documenti, note, diagrammi, LLM Wiki: tutto ciò che non entra nella hot memory e
  che l'agente rispolvera quando ne ha bisogno.
- **Memoria operativa.** Le skill: procedure con un nome e una descrizione, che
  l'agente richiama quando la situazione lo richiede. Una mappa del namespace k8s, un
  runbook di troubleshooting, una checklist di upgrade.
- **Agenti e subagent custom.** Definizioni di agenti specializzati con strumenti ed
  istruzioni.
- **Estensioni varie.** Server MCP, plugin, hook, script eseguibili, programmi CLI ...

La formula che circola è `Agent = Model + Harness`, e il
workspace è la parte di harness che possiedi tu ([outer harness](https://martinfowler.com/articles/harness-engineering.html)), 
perchè si, di solito i coding agent CLI portano già con sé una parte di harness. 
La tassonomia qui sopra è la stessa che trovi in [letteratura](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness),
solo riorganizzata attorno a come si usa un cluster k8s.

L'harness di Freelens AgentBridge:
[freelens-agentbridge-harness](freelens-agentbridge-harness.png)

## Cosa ci mette AgentBridge

[AgentBridge](https://github.com/freelensapp/freelens-agentbridge-extension) è
un'estensione di [Freelens](https://freelens.app) che **ti costruisce l'agent harness al posto tuo** per il tuo agente che hai già installato sul tuo PC.
Apri un cluster in Freelens, scegli il tuo agente AI di fiducia (OpenCode, Claude
Code, Copilot CLI o Codex o la qualunque) e avvii la sessione in una tab
del terminale agganciata a Freelens. Quando il tuo agente si avvia, tre cose sono già
a posto: 
- un `KUBECONFIG` che punta al cluster che hai aperto
- una directory di lavoro (una folder nel tuo PC che potrai alla bisogna ispezionare) che 
dentro conterrà già una memoria (AGENTS.md), un file di permessi ed un comando preimpostati 
(esatto, è un agent harness basico da customizzare).

Da questo momento in poi, questa cartella rappresenta tutto quello che il tuo agente conosce e che può fare sul tuo cluster;
i tre file forniti dall'estensione (AGENTS.md/CLAUDE.md, file di permessi e comando) si
modificano da un editor in Freelens. Il resto dell'harness lo riempi
lavorando: la memoria a lungo termine che l'agente si costruirà, LLM Wiki con la documentazione funzionale dei servizi del cluster, 
le skill per le procedure di troubleshooting, gli agenti custom e gli MCP servers. 
La directory resta una directory normale sulla tua macchina, ma se ci lanci un agente AI all'interno si trasforma in un agent workspace 
e se lo lanci da Freelens con KUBECONFIG iniettato ancora meglio..

Il workspace è persistente e separato per ogni coppia cluster+provider. Quello
che l'agente impara su produzione non finisce nel contesto di staging, e la
mappa che costruisce oggi è ancora lì lunedì prossimo.

## todo screen di agentbridge con editor dell'harness

## Trade-off autonomia - sicurezza

Quanta strada fa l'agent prima di doverti chiedere qualcosa?
Con il profilo di default, le letture passano da sole: `get`, `describe`, `logs`, `explain`, 
`api-resources`, `auth can-i`, `top`, `version`, più le letture `helm`. 
Tutto il resto, quindi `apply`, `patch`, `delete`, `scale`, `exec`, si ferma e chiede conferma. 
L'analisi è autonoma, la modifica ha un gate.

Il gate risiede nell'harness stesso: per OpenCode, ad esempio, 
è un file di permessi nel workspace, configurabile anche per singolo cluster. 
Senza scendere nei dettagli specifici del singolo coding agent, il concetto di alto 
livello è che possiamo nativamente, con la maggior parte degli agent supportati, permettere 
o farci chiedere conferma per i comandi che decidiamo di tenere sotto controllo.
Facciamo un esempio così ci capiamo meglio. 
OpenCode codifica i permessi dell'agente nel file `.opencode/opencode.json`, e per il mio cluster `prod-eu-1` ho:

`[prod-permission](prod-permission.jpg)`

Qui i comandi di sola lettura (`get`, `describe`, `logs`, `explain`, ...) sono in `allow`: 
l'agente li esegue senza fermarsi. Il wildcard `"*": "ask"` copre tutto il resto, 
quindi `apply`, `patch`, `delete`, `scale`, `exec`, e per qualsiasi comando fuori da quella 
lista l'agente si ferma e chiede conferma prima di procedere. Le regole vengono valutate in 
ordine e l'ultima che matcha vince, quindi l'ordine delle chiavi nel file conta: le regole più 
specifiche vanno prima del wildcard generico.

Per l'ambiente di staging/sviluppo invece possiamo essere più permissivi, e consentire che 
l'agent tiri giù qualche pod da solo:

`[staging-permission](staging-permission.jpg)`

Rispetto a prod, qui alcune operazioni distruttive (ad esempio `delete pod` o `scale`) 
passano da `ask` ad `allow`: l'agente può eseguirle senza fermarsi. 
Resta comunque `ask`, o meglio resterebbe buona norma tenerlo così, su operazioni più 
delicate come `exec` in un container, dato che apre una shell interattiva nel pod.

Oggi AgentBridge supporta diversi agent, Claude Code, Copilot CLI, Codex, Pi, e ognuno 
ha il proprio meccanismo per bloccare o consentire l'esecuzione di comandi, ma il concetto 
di base resta lo stesso: letture libere, scritture con gate configurabile per contesto.

Sopra tutto questo c'è il confine che conta davvero: l'RBAC del kubeconfig che Freelens passa all'agent. 
Qualunque cosa scriva il file di permessi dell'harness, l'agente non potrà mai fare più di 
quanto tu stesso puoi fare con quel kubeconfig.

Il resto dell'articolo racconta una giornata sui cluster `prod-eu-1` e `staging-eu-1`, 
namespace `docpipe`, con una pipeline che prende PDF e li rende cercabili: `upload-api`, 
`ocr-worker`, `doc-store`, `indexer`, `callback-dispatcher`, `search-api`. 
Useremo OpenCode per semplicità; con gli altri agent cambiano i nomi dei file e i meccanismi di 
approvazione, non l'idea di fondo.

Lo so, lo so.. a questo punto sarebbe utile un mini diagramma architetturale per 
farti vedere esattamente cosa l'agente si troverà davanti nel namespace docpipe. 
Niente paura: chiederemo direttamente a OpenCode di generarcelo.

## Mattina - un cluster che non hai mai visto

Sei in `prod-eu-1` da ieri e Freelens ti mostra ventidue deployment in sei namespace. 
Sai i nomi dei servizi ma non sai come si parlano tra loro.

Prompt:
```
Ricostruisci come funziona la pipeline nel namespace docpipe: chi chiama chi,
cosa sta in mezzo, dove sono i punti di rottura. Salva la mappa dove la
ritrovi domani.
```

**Cosa fa l'agente al posto tuo**

1. Elenca deployment, service, ingress, ConfigMap e code/queue del namespace.
2. Incrocia i selector dei service con le label dei pod, per capire chi risponde davvero a cosa e non chi *dovrebbe*.
3. Legge le variabili d'ambiente dei container, che è dove i servizi dichiarano puntamenti.
4. Guarda le probe e il numero di repliche di ognuno.
5. Legge i log dei servizi per vedere quali rotte compaiono e con quale frequenza, 
   magari riesce a raccogliere anche qualche correlation ID per capire meglio il tracing di ogni richiesta.
6. Scrive il risultato in una skill per namespace e in una skill di cluster, più una breve nota nel file AGENTS.md.

**L'esito.** 
La mappa che ne esce non è quella che avresti disegnato tu. 
Il servizio `indexer`: te lo immagini come colui che indicizza i documenti 
appena usciti dall'OCR e invece.. è un batch notturno di riconciliazione; 
l'indicizzazione in tempo reale la fa `search-api` su un endpoint interno.
Il nome mentiva, come mentono i nomi dopo due anni di refactoring.

Quella mappa non resta in chat: è un file che assomiglia a questo:

```markdown
---
name: ns-map-docpipe
description: Map of the docpipe namespace in prod-eu-1 - workloads,
  services, config, storage, RBAC, risks. Load when working in this namespace.
---
## Workloads
- upload-api (Deployment, 3/3) → Service upload-api:8080 → Ingress docs.example.com
- ocr-worker (Deployment, 5 replicas) ← queue ocr.jobs (rabbitmq.docpipe:5672)
- indexer (CronJob, 02:00) → nightly reconciliation, not real-time indexing
- search-api (Deployment, 2/2) → indexes on write, internal endpoint

## Config
- ConfigMap ocr-worker-config: no input size limit (names and keys only)

## Risks
- ocr.jobs has no dead-letter queue
- UPLOAD_HOOK_URL points outside the cluster, unreachable from here
```

Da domani ogni domanda su `docpipe` parte già informata, perché l'agent carica la skill quando serve.

Nella skill c'è anche il diagramma dell'architettura, ricavato dalle stesse letture:

```mermaid
flowchart LR
    client([Client]) --> ingress[docs.example.com<br/>Ingress]
    subgraph docpipe["namespace docpipe"]
        ingress --> svc[Service<br/>upload-api:8080]
        svc --> upload[upload-api<br/>Deployment 3/3]
        upload -->|publish| queue[(ocr.jobs<br/>rabbitmq.docpipe:5672<br/>no dead-letter queue)]
        queue -->|consume| ocr[ocr-worker<br/>Deployment 5 replicas<br/>no input size limit]
        ocr -->|index on write| search[search-api<br/>Deployment 2/2<br/>internal endpoint]
        indexer[indexer<br/>CronJob 02:00<br/>not real-time indexing] -.->|nightly reconciliation| search
    end
    upload -.->|UPLOAD_HOOK_URL| external[outside the cluster<br/>unreachable]
    classDef risk stroke:#c0392b,stroke-width:2px
    class queue,ocr,external risk
```

Nota a margine. 
Il comando /build-cluster-map, che l'estensione pre-installa nel workspace, fa esattamente 
questo giro su tutto il cluster se preferisci non scrivere il prompt a mano. 
È read-only e idempotente: alla seconda esecuzione aggiorna quello che c'è invece di duplicarlo. 
Fa partire uno sciame di agenti in parallelo, uno per namespace, che analizzano ogni 
componente e riportano tutto all'agente supervisor; 
il supervisor raccoglie i risultati e produce una skill per namespace più la skill di cluster che li aggrega. 
In questo modo, quando nelle prossime domande chiediamo qualcosa relativa a un namespace 
oppure a un pod/deployment specifico, abbiamo già la KB pronta.

## Metà mattina - `ocr-worker` riavvia in loop

Freelens ti mostra cinque pod `ocr-worker`, tre in `CrashLoopBackOff`.
I restart sono 12, 9, 3, 0, 0. Nessun deploy da ieri.
Quindi non sei stato tu a romperlo, almeno non oggi.

```
I pod ocr-worker nel namespace docpipe riavviano in loop. Capisci perché.
```

**Cosa ha fatto al posto tuo**

1. Elencato i pod e notato che i restart sono sparpagliati, non uniformi.
   Se fosse uno spike di carico generale sarebbero simili.
2. Guardato lo stato precedente di ognuno: `OOMKilled`, exit 137.
3. Letto i log del container precedente su due pod diversi ed entrambi si
   fermano sulla stessa riga: `processing document doc_84f2c1`.
4. Scartato l'ipotesi memoria: un worker troppo piccolo morirebbe su documenti diversi, non sempre sullo stesso.
5. Letto la ConfigMap del worker: nessun limite sulla dimensione dei file in ingresso.
6. Guardato gli eventi della coda: quel messaggio è stato riconsegnato decine di volte.

**Dove si è fermato.**
Propone tre cose: alzare la memoria come patch, mettere una guardia sulla
dimensione del file in ingresso, e configurare una dead-letter queue.

Le prime due toccano il deployment, e `kubectl patch` non è nella lista dei permessi di questo workspace:
si ferma e chiede: "Ho intenzione di lanciare questo comando kubectl patch... approvi?"
Autorizzi solo la patch sulla memoria per sistemare temporaneamente.

La richiesta di approvazione mostra esattamente cosa sta per succedere:

```
$ kubectl -n docpipe patch deployment ocr-worker --type=json \
    -p '[{"op":"replace","path":"/spec/template/spec/containers/0/resources/limits/memory","value":"2Gi"}]'
Allow? [y/N]
```

**L'esito.**
La memoria è il sintomo. Il problema vero è un documento che avvelena la coda:
un PDF scansionato enorme che ogni worker prende, prova a elaborare, ed esaurisce la RAM.
La coda non riceve conferma e glielo rispedisce dopo.
Il loop non gira intorno ai pod, gira intorno a quel messaggio.

Alzare la memoria e chiudere lì, come suggeriva `OOMKilled` alle 9:40, avrebbe
tenuto in piedi i worker giusto il tempo di masticare quel documento,
lasciando intatto lo stesso problema per il prossimo file grosso.

**Andiamo oltre**
La patch sulla memoria compra tempo, non risolve niente: 
il prossimo PDF enorme rimetterà tutto in loop. 
La repository di `ocr-worker` è clonata in locale, quindi lo step successivo è chiedere all'agente di guardarci dentro:

```
Il codice di ocr-worker è in ~/repos/docpipe/ocr-worker. Incrocia i log del pod
con il codice sorgente, trova dove manca il controllo sulla dimensione del file
in ingresso e proponi una fix.
```

L'agente incrocia la riga di log dove il worker si blocca con il punto del codice che la 
genera, individua il file giusto (quello che legge il PDF e lo passa al 
motore OCR senza controllare la dimensione), e fa partire un subagent dedicato: 
pianifica la fix, la scrive, la verifica con i test esistenti e la pusha su un branch dedicato. 

Non tocca `main`: quel branch aspetta una revisione umana prima di finire in produzione.

![placeholder: l'agent chiede l'approvazione per la patch](TODO-immagine-3.png)

## Prima di pranzo — la modifica prima dell'apply

Hai il manifest col nuovo limite di memoria per `ocr-worker`. Sintatticamente è
corretto. La review l'ha fatta chi ha guardato il diff, non il cluster.

```
Questo manifest sta per andare su docpipe. Confrontalo con quello che gira
adesso e dimmi cosa si potrebbe rompere.
```

**Cosa ha fatto al posto tuo** — solo letture, quindi nessuna conferma
richiesta:

1. Letto il deployment vivo e confrontato campo per campo con il file.
2. Guardato `ResourceQuota` e `LimitRange` del namespace, che è il contorno che
   nel diff non si vede.
3. Contato le repliche attuali, per moltiplicare il nuovo limite su quelle vere
   e non su quelle dichiarate nel chart.

**Dove si è fermato.** Prima dell'`apply`. Ha preparato il comando e chiesto,
come previsto dai permessi.

**L'esito.** Due cose che il diff non poteva vedere. La prima: il namespace ha
una `ResourceQuota` sulla memoria quasi esaurita, e il nuovo limite per tre
repliche non ci sta dentro. L'`apply` passa la validazione, il ReplicaSet non
riesce a creare i pod, e finisci a debuggare un rollout bloccato invece di un
crash. La seconda: il deployment che gira ha una env var che nel chart non
esiste — qualcuno l'ha aggiunta a mano mesi fa, e il tuo apply la cancella.

Il diff era corretto. Era il cluster a essere diverso da come lo immaginavi. E
l'agent non stava valutando il manifest in astratto: guardava questo cluster,
perché è l'unico a cui è collegato.

## Pomeriggio — il bug che si vede solo in cluster

`callback-dispatcher` non va in crash e non mostra errori evidenti.
Semplicemente alcuni callback agli utenti non arrivano. In locale il servizio
funziona. In staging funziona.

```
Alcuni callback non partono. Qui trovi il log del servizio, il checkout del
repo è in ~/src/callback-dispatcher. Guardali insieme.
```

**Cosa ha fatto al posto tuo.**

1. Filtrato il log applicativo sul pattern dei timeout, che era l'unica cosa
   ricorrente.
2. Aperto nel repo il punto in cui viene letta la configurazione.
3. Letto la ConfigMap viva del servizio e confrontato le chiavi con quelle che
   il codice cerca.

**Dove si è fermato.** Ha trovato la correzione, ma è una modifica alla
ConfigMap: chiede. E il fix nel repo lo propone come diff da rivedere, non lo
committa.

**L'esito.** Avresti guardato nella logica di retry. La causa era altrove: una
chiave rinominata. Il codice legge `callback_timeout_ms`, la ConfigMap in
produzione dichiara ancora `callbackTimeoutMs`. Nessun errore, nessun log: il
parser non trova la chiave e usa il default, troppo basso per i clienti lenti.
Funzionava in staging solo perché lì la ConfigMap era già stata aggiornata.

Il path del checkout resta nelle sue istruzioni: la prossima volta che un bug
attraversa il confine tra codice e cluster, sa già dove guardare da entrambi i
lati.

## Sera — audit, postmortem, runbook

Sono le 18. L'incidente è chiuso, la patch applicata, e su Freelens è tutto
verde — che è proprio il momento peggiore per fidarsi. Restano le due cose che
di sera si rimandano sempre: mettere tutto a verbale e capire chi sarà il
prossimo a saltare.

```
Tre cose. Uno: in docpipe trovami ogni container senza requests, ogni
deployment a replica singola, ogni pod senza probe. Due: ricostruisci la
timeline di stamattina, separando quello che abbiamo verificato da quello che
abbiamo supposto. Tre: trasforma il giro di stamattina in un runbook riusabile.
```

**Cosa ha fatto al posto tuo** — le prime due sono letture pre-autorizzate, la
terza scrive solo dentro il suo workspace:

1. Scritto lui il `jsonpath` che tu non ricordi mai a memoria, e passato tutti
   i deployment del namespace, non solo quelli che avevi in testa.
2. Ricostruito la timeline da eventi e conteggi di restart, segnando riga per
   riga cosa è verificato e cosa è ipotesi.
3. Salvato la procedura di stamattina come skill di troubleshooting nel
   workspace: dalla lettura dei restart alla verifica della coda, con i comandi
   e i punti di decisione.

**Dove si è fermato.** Non su un permesso: su una domanda. Quali passi di
stamattina vanno nel runbook e quali erano specifici di quel singolo documento.
È l'unica parte che non può decidere da solo.

**L'esito.** Ti aspetteresti che l'audit puntasse il dito su `ocr-worker`, il
servizio che ti ha fatto perdere la mattina. Invece il punto fragile è
`callback-dispatcher`: una sola replica, nessuna liveness probe, nessun
`requests`. Il servizio silenzioso che nessuno guarda è sempre quello giusto da
controllare. E la distinzione tra verificato e supposto — quella che nei
postmortem scritti a mano di sera finisce sempre per sparire — questa volta è
nero su bianco nel documento.

Il runbook è una skill nel workspace: la prossima sessione la trova già pronta,
e committata nel repo di team diventa una procedura condivisa invece
dell'ennesima pagina di wiki. Il pannello *Workspace artifacts* nel frattempo ti
mostra cosa l'agent ha prodotto, mentre in una seconda tab lo stesso audit gira
su `staging-eu-1`, con permessi più larghi e note separate.

## Casi d'uso che non stanno in una giornata

La giornata qui sopra è solo un campione. Il workspace si presta a molto altro.

- **Runbook di remediation e troubleshooting.** Un percorso di diagnosi
  codificato una volta e riusato; nel repo del team vale per tutti.
- **Onboarding su un cluster nuovo.** `/build-cluster-map` il primo giorno, e
  dal secondo le domande partono da una mappa invece che da zero.
- **Pre-check di upgrade.** API deprecate, PDB, quote e limiti prima di alzare
  la versione del cluster, quando l'errore costa molto più della verifica.
- **Drift detection.** Confronto tra ciò che gira e ciò che il chart dichiara:
  le modifiche a mano, come la env var di stamattina, vengono fuori prima di
  essere cancellate da un apply.
- **Audit periodico di postura.** Repliche singole, probe mancanti, `requests`
  assenti, NetworkPolicy: la lista di sera, trasformata in controllo ricorrente.
- **Capacity e costi.** Con metrics-server o Prometheus i numeri ci sono; senza,
  resta una stima, non una cifra su cui firmare.

Questi sono solo alcuni esempi di cosa si può chiedere a un coding agent che
vive nel tuo cluster: qui il limite è solo la tua fantasia.

## Dove non credergli

Tre confini, ed è bene tenerli a mente.

**Il file dei permessi non è sicurezza.** Controlla cosa l'agent chiede prima
di fare, dentro la sua sessione. Il confine vero è l'RBAC del kubeconfig che
Freelens gli passa: l'agent non potrà mai fare più di quanto puoi fare tu.

![placeholder: l'editor dei permessi dentro Freelens](TODO-immagine-4.png)

## Chiusura

La cosa che cambia dopo un mese non è la velocità con cui scrivi i comandi.

È che il workspace del cluster ha smesso di essere una semplice directory di
configurazione. Dentro ci sono la mappa della pipeline, il fatto che `indexer`
non indicizza niente, la nota che quella coda non ha una dead-letter, il path
del repo, il runbook della mattina. È la documentazione del cluster che per
una volta è aggiornata, perché la aggiorna chi la usa mentre la usa — non una
persona designata, il venerdì pomeriggio, su un wiki che nessuno apre mai.

- [Estensione AgentBridge](https://github.com/freelensapp/freelens-agentbridge-extension)
- [OpenCode](https://opencode.ai/docs/) · [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) · [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) · [OpenAI Codex CLI](https://developers.openai.com/codex/cli/)

## Per approfondire

Se il capitolo sul workspace ti ha incuriosito, l'impianto viene da qui.

**Harness engineering**

- [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html) — Martin Fowler / Birgitta Böckeler
- [The Anatomy of an Agent Harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness) — LangChain
- [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) — OpenAI

**Memoria, contesto e skill**

- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic
- [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — Anthropic
- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291) — la skill library prima delle skill

**Standard**

- [AGENTS.md](https://agents.md/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

**Studi accademici**

- [Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents](https://arxiv.org/abs/2609.00006) — undici harness a confronto, OpenCode incluso
