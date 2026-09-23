# Regole implementate

La base normativa del gameplay è il **Codice di Gara FIBUR — Edizione Gennaio 2026**.
Questo documento distingue le regole ufficiali già rilevanti, le astrazioni digitali
usate dall'implementazione e le assunzioni temporanee di prodotto. Le regole relative
alle funzionalità non ancora implementate saranno aggiunte prima della relativa
implementazione.

## Mazzo

- Si usano due mazzi francesi completi: 108 carte in totale.
- Ogni mazzo ha 52 carte (assi, 2–10, jack, queen e king in quattro semi) e due jolly.
- Il due è una *pinella*: la carta fisica è capace di assumere funzione di matta, ma
  nelle sequenze può anche occupare il proprio posto naturale prima del 3. Il jolly
  ha sempre funzione di matta. Le regole di validazione delle nuove calate sono
  descritte nel milestone 3.
- Ogni carta fisica possiede un identificatore stabile e unico, incluso il numero del
  mazzo. Per esempio, le due carte `ace-hearts` non vengono confuse.

## Preparazione del round

### Regole ufficiali applicate

- La partita ha quattro giocatori e due coppie contrapposte.
- Ogni giocatore riceve 11 carte e vengono predisposti due pozzetti da 11 carte.
- Al termine della distribuzione, la carta successiva apre il monte degli scarti.
  Può essere una carta ordinaria, una pinella o un jolly: non viene saltata né
  sostituita.

### Astrazioni digitali dell'implementazione

- Dopo lo shuffle, le 11 mani sono distribuite in 11 giri, nell'ordine
  `player-1`, `player-2`, `player-3`, `player-4`. È l'equivalente logico della
  distribuzione in senso orario; non simula taglio e meccanica fisica del tavolo.
- Le 22 carte successive formano i pozzetti alternandosi tra `pozzetto-1` e
  `pozzetto-2`, fino a 11 carte per ciascuno.
- La sessantasettesima carta dell'ordine risultante (dopo 44 carte di mano e 22 di
  pozzetti) diventa direttamente lo scarto iniziale; le 41 carte restanti formano
  il tallone.
- Il primo turno digitale è assegnato a `player-1`, in fase “attendere la pesca”.

### Assunzioni temporanee di prodotto

- I nomi visualizzati dei giocatori e l'identità iniziale di `player-1` sono segnaposto
  dell'MVP; non definiscono una regola FIBUR.

## Ciclo del turno — milestone 2

### Regole ufficiali applicate

- All'inizio del turno, il giocatore di mano sceglie una sola alternativa: pescare la
  carta in cima al tallone oppure raccogliere il monte degli scarti.
- Dopo questa scelta, il giocatore conclude il turno scartando una carta dalla propria
  mano; lo scarto va in cima al monte e il turno passa al giocatore successivo.
- Se il monte raccolto è composto da una sola carta, quella stessa carta non può essere
  normalmente scartata nello stesso turno. L'eccezione è la presenza, già nella mano
  del giocatore, di un'altra carta equivalente: per le carte ordinarie stesso valore e
  stesso seme; per i jolly, un altro jolly.
- La rotazione digitale segue `player-1` → `player-2` → `player-3` → `player-4` →
  `player-1`, come rappresentazione dell'ordine di gioco a quattro giocatori.

### Astrazioni digitali dell'implementazione

- Il motore rappresenta l'inizio turno con la fase `mustDraw` e il momento successivo
  alla pesca/raccolta con la fase `action`.
- La cima del tallone è l'elemento all'indice `0` di `drawPile`; pescare lo rimuove da
  tale indice. La cima del monte degli scarti è l'ultimo elemento di `discardPile`;
  uno scarto viene aggiunto in coda.
- Raccogliere gli scarti trasferisce l'intero monte, nell'ordine interno conservato,
  nella mano del giocatore e svuota `discardPile`. Durante `action`, il turno conserva
  la sorgente e gli ID fisici delle carte acquisite; per un monte di una sola carta,
  conserva anche se al momento della raccolta la mano conteneva già una carta equivalente.
  Queste informazioni applicano il vincolo sullo scarto singolo e spariscono al passaggio
  di turno.
- Un singolo comando di scarto termina atomicamente il turno: non esiste un comando
  separato di fine turno.

### Esaurimento del tallone

- La conclusione della smazzata per esaurimento del tallone è descritta nella
  milestone 13. `drawCard` su un tallone vuoto continua a restituire l'errore di
  dominio `DRAW_PILE_EMPTY` come difesa, benché tale stato non sia più raggiungibile
  nel gioco normale.

## Dominio e validazione delle nuove calate — milestone 3

Questa sezione riguarda esclusivamente l'analisi pura di un insieme candidato di
carte fisiche. La validazione non modifica lo stato della partita, non toglie carte
dalla mano e non colloca ancora calate sul tavolo.

### Regole comuni

- Una nuova calata valida è una combinazione oppure una sequenza e contiene almeno
  tre carte fisiche con ID distinti.
- L'ordine delle carte ricevute non influenza la validità. Una calata valida viene
  restituita in un ordine semantico deterministico e conserva le carte fisiche
  originali.
- La rappresentazione distingue la carta fisica capace di fungere da matta dalla
  funzione effettivamente assunta nella calata. Ogni collocazione ha ruolo `natural`
  oppure `wildcard`; una matta attiva conserva separatamente il rango rappresentato.
- Una nuova calata può contenere al massimo una matta attiva. L'eccezione apparente
  è una sequenza con un 2 naturale dello stesso seme e un'altra matta attiva: il 2
  naturale non consuma il limite della matta.
- Una candidatura illegale produce un risultato invalido con motivo tipizzato e
  stabile; non viene lanciata un'eccezione per la normale invalidità della calata.
  L'ingresso digitale illegale viene quindi impedito prima dell'impegno della mossa:
  non sono simulate le procedure arbitrali FIBUR per carte esposte o penalizzate.

### Combinazioni

- Una combinazione contiene almeno tre carte in totale. Le sue carte naturali
  condividono lo stesso rango; sono ammesse fino a otto carte naturali e al massimo
  una matta attiva, per un massimo complessivo di nove carte. Sono quindi sufficienti
  due carte naturali dello stesso rango insieme a una matta.
- I semi non devono essere distinti. Poiché si usano due mazzi, le due copie fisiche
  della stessa carta (stesso rango e stesso seme) possono coesistere nella stessa
  combinazione, purché abbiano ID fisici diversi.
- In una combinazione una pinella non è mai un 2 naturale: pinelle e jolly sono matte
  attive. Una combinazione composta soltanto da pinelle e/o jolly è quindi invalida.
- Le carte naturali devono condividere tutte lo stesso rango; una singola pinella o
  un singolo jolly può rappresentare quel rango.

### Sequenze

- Una sequenza contiene da tre a quattordici carte: fino a tredici ranghi naturali
  e un'eventuale matta attiva.
- Tutte le carte naturali appartengono allo stesso seme e occupano ranghi consecutivi.
  La stessa posizione naturale non può comparire due volte, nemmeno usando le copie
  della stessa faccia provenienti dai due mazzi.
- Un jolly è sempre una matta attiva. Una pinella fuori seme può essere soltanto una
  matta attiva. Una pinella dello stesso seme può essere il 2 naturale immediatamente
  precedente al 3 oppure, quando richiesto dall'interpretazione legale, fungere da
  matta attiva.
- Sono pertanto lecite sia la presenza di un 2 naturale con un jolly, sia quella di
  un 2 naturale con una seconda pinella attiva. Con due copie fisiche dello stesso
  2, la scelta della copia naturale è deterministica e gli ID restano distinti.
- La matta attiva copre una sola posizione mancante. Un vuoto interno determina
  direttamente il rango rappresentato. Se la matta è libera a un'estremità, viene
  risolta all'estremità di rango più basso; quando tale estremità è già occupata
  dall'Asso basso, viene collocata all'estremità alta.
- Nella sequenza naturale completa da Asso a King, l'eventuale quattordicesima carta
  è conservata semanticamente come matta libera (`representedRank: null`) oltre
  l'estremità alta: non viene inventato un rango inesistente e la carta fisica resta
  invariata.
- L'Asso può essere basso prima del 2 oppure alto dopo il King. L'ordine semantico
  non è circolare e l'Asso non può occupare entrambe le estremità: una sequenza
  risolta come `K-A-2 naturale` o `Q-K-A-2 naturale` è invalida. La sola presenza
  fisica di una pinella dopo un Asso alto non implica però wraparound: la pinella può
  fungere da matta attiva. Per esempio, le carte fisiche `K♠-A♠-2♠` sono risolte come
  `Q♠-K♠-A♠`, con il `2♠` invariato fisicamente ma nel ruolo di wildcard per la Queen.
- L'analisi considera un numero finito di interpretazioni semantiche (Asso basso,
  Asso alto e possibili ruoli delle pinelle) e non genera permutazioni delle carte.

### Rilevamento e normalizzazione

- `validateGroup`, `validateSequence` e `validateMeld` sono funzioni pure. L'ultima
  rileva automaticamente il tipo della calata; in un ipotetico caso valido per
  entrambi i tipi, la combinazione ha precedenza deterministica.
- Il risultato validato distingue `group` e `sequence`; conserva rango della
  combinazione oppure seme e orientamento dell'Asso della sequenza, ordine
  normalizzato, carta fisica di ogni collocazione e assegnazione della matta attiva.

### Funzionalità rinviate

- sostituire o spostare jolly e pinelle già sul tavolo;
- punteggio.

Queste funzioni restano fuori dall'attuale implementazione.

## Integrazione delle nuove calate — milestone 4

- Durante la fase `action`, soltanto il giocatore di turno può creare una nuova calata.
  La mossa non termina il turno e non modifica le informazioni sull'acquisizione delle
  carte; il giocatore può continuare ad agire e poi scartare normalmente.
- Il comando riceve gli ID delle carte fisiche. Ogni ID deve comparire una sola volta
  nella richiesta e deve identificare una carta realmente presente nella mano del
  giocatore. Carte equivalenti per rango e seme non sono intercambiabili.
- La combinazione viene analizzata esclusivamente da `validateMeld`. Se non è valida,
  oppure se fallisce un controllo di turno o possesso, il comando produce un errore di
  regola e lo stato precedente resta integralmente invariato.
- Una mossa valida rimuove dalla mano soltanto le carte selezionate e conserva nel
  tavolo di squadra il `ValidatedMeld` completo, inclusi ordine semantico, carta fisica,
  ruolo della matta e `representedRank`.
- Le calate sono memorizzate una sola volta nella collezione `melds` della squadra.
  Entrambi i compagni contribuiscono quindi allo stesso insieme, mentre la squadra
  avversaria non viene modificata.

## Estensione delle calate di squadra — milestone 5

- Durante la fase `action`, il giocatore di turno può aggiungere una o più carte
  fisiche della propria mano a una calata già presente nella raccolta della sua
  squadra, inclusa una calata originariamente creata dal compagno. Non può agire
  sulle calate avversarie.
- La calata bersaglio è identificata dal suo indice zero-based nella raccolta
  `team.melds`. La selezione vuota e un indice inesistente sono errori espliciti.
- Il motore ricostruisce l'insieme completo usando le carte fisiche della calata e
  quelle aggiunte, quindi lo passa nuovamente a `validateMeld`. Solo un risultato
  completo valido sostituisce la calata precedente; ruoli e rango rappresentato da
  jolly o pinelle possono quindi essere ricalcolati dal validatore.
- La riuscita rimuove dalla mano soltanto gli ID fisici richiesti, sostituisce solo
  la calata selezionata e non termina il turno. Qualunque errore lascia invariato
  l'intero stato di gioco.

## Classificazione del Burraco — milestone 6

- Una calata valida è un Burraco soltanto quando contiene almeno sette carte fisiche;
  le calate valide da tre a sei carte sono classificate come `none` e restano
  perfettamente lecite.
- Un Burraco è pulito (`clean`) quando non contiene alcuna matta attiva. Una pinella
  interpretata semanticamente come 2 naturale ha ruolo `natural` e non sporca il
  Burraco.
- Un jolly ha sempre ruolo di matta attiva. Una pinella assume ruolo di matta attiva
  solo quando il validatore la colloca come `wildcard`; in entrambi i casi la calata
  è sporca (`dirty`) salvo la condizione semipulita descritta di seguito.
- Una sequenza è semipulita (`semi-clean`) quando la matta attiva si trova a una
  estremità dell'ordine semantico normalizzato e precede o segue almeno sette altre
  carte. Una matta interna resta sporca. Anche una matta libera oltre la sequenza
  naturale completa Asso–King, con `representedRank: null`, resta una matta attiva e
  segue la stessa regola posizionale.
- Una combinazione è semipulita soltanto quando è composta da esattamente otto carte,
  matta inclusa. La combinazione da sette carte con matta è sporca. La combinazione
  legale da nove carte (otto naturali più una matta) è anch'essa sporca: il Codice di
  Gara FIBUR 2026 riserva espressamente il semipulito alla combinazione di otto carte,
  mentre classifica come sporco ogni Burraco con matta che non sia il 2 naturale.
- La classificazione usa esclusivamente i ruoli semantici prodotti dalla validazione,
  non il rango stampato della carta. È una proprietà derivata dal `ValidatedMeld`
  corrente e non viene memorizzata nello stato: dopo un'estensione, la nuova calata
  rivalidata produce sempre la classificazione aggiornata senza metadati di ciclo di
  vita ridondanti.

La classificazione non implementa punteggio, sostituzione o spostamento delle matte
o determinazione del vincitore; la chiusura usa dinamicamente questa classificazione
senza memorizzarla nello stato.

## Acquisizione del pozzetto — milestone 7

- Ogni coppia può prendere un solo pozzetto. Il diritto nasce automaticamente quando
  uno dei due giocatori termina la prima mano; lo stato della squadra lo registra con
  `hasTakenPozzetto`, senza dedurlo dal solo contenuto dei pozzetti.
- Se il giocatore termina la mano aprendo una calata o legando carte a una calata
  esistente, prende il pozzetto *al volo*: non effettua lo scarto, mantiene il turno
  in fase `action` e può giocare immediatamente le carte ricevute. L'acquisizione
  registrata nel turno continua a descrivere la pesca o raccolta che lo ha aperto.
- Se il giocatore termina la mano scartando l'ultima carta, prende il pozzetto *con lo
  scarto*: la carta entra normalmente nel monte degli scarti, il turno passa al
  giocatore successivo in fase `mustDraw` e il pozzetto sarà giocabile soltanto al
  successivo turno del giocatore che lo ha preso, dopo la normale pesca o raccolta.
- Andare a pozzo con lo scarto non è una chiusura definitiva: l'ultima carta può essere
  anche un jolly o una pinella, ferme restando le altre regole già applicate allo
  scarto. Il divieto di scartare una matta vale soltanto per la chiusura definitiva
  descritta nella milestone 8.
- I due pozzetti non sono preassegnati alle squadre. L'astrazione digitale assegna in
  modo deterministico il primo pozzetto ancora disponibile; il suo slot diventa vuoto
  e la seconda squadra riceverà quello restante quando maturerà il diritto.
- Nella presa con scarto le carte vengono inserite subito nella mano digitale, pur non
  essendo giocabili fino al turno successivo. Non sono simulate la consegna materiale,
  la visione fuori turno, le carte esposte, le ammonizioni o le altre procedure
  arbitrali legate ai pozzi; un'eventuale UI potrà limitarne la visibilità.

I bonus di chiusura e il punteggio sono descritti nella milestone 9; l'esaurimento
regolamentare del tallone nella milestone 13.

## Chiusura definitiva della smazzata — milestone 8

### Requisiti e transizione

- La chiusura definitiva può avvenire soltanto quando il giocatore di turno, in fase
  `action`, termina la propria seconda mano effettuando lo scarto finale. La squadra
  deve quindi avere già preso il pozzetto (`hasTakenPozzetto: true`).
- La squadra deve possedere almeno una calata che `classifyBurraco` classifica come
  `clean`, `semi-clean` oppure `dirty`. La classificazione viene derivata dalle calate
  correnti; non esiste un flag `hasBurraco` ridondante. Una classificazione `none` non
  soddisfa il requisito.
- La carta fisicamente scartata per chiudere non può essere una matta: sono vietati
  sia ogni jolly sia ogni carta di rango `two`, indipendentemente dall'eventuale ruolo
  naturale che quella pinella avrebbe potuto assumere in una calata.
- Una chiusura valida rimuove l'ultima carta dalla mano, la aggiunge normalmente in
  cima al monte degli scarti e porta il round allo stato `completed`, registrando
  `closedByPlayerId` e `closingTeamId`. Lo stato completato non contiene un turno e
  non assegna un altro pozzetto.
- Dopo il completamento, `drawCard`, `takeDiscardPile`, `discardCard`, `playMeld` ed
  `extendMeld` sono tutti rifiutati con `ROUND_COMPLETED`; nessun comando di gameplay
  successivo può modificare lo stato.

### Distinzione dal pozzetto e chiusure irregolari

- Se la squadra non ha ancora preso il pozzetto, scartare l'unica carta rimasta è la
  presa del pozzetto con lo scarto della milestone 7, non una chiusura. Il round resta
  `in-progress`, il turno passa normalmente e lo scarto può essere anche un jolly o
  una pinella.
- Prima del pozzetto resta valida anche la presa *al volo*: `playMeld` o `extendMeld`
  possono svuotare la prima mano, assegnare immediatamente il pozzetto e conservare lo
  stesso turno in fase `action`.
- Dopo che il pozzetto è già stato preso, `playMeld` ed `extendMeld` non possono
  consumare tutte le carte residue: la chiusura senza scarto viene impedita con
  `CANNOT_CLOSE_WITHOUT_DISCARD`.
- Un tentativo di scartare l'ultima carta dopo il pozzetto viene impedito con
  `CANNOT_CLOSE_WITHOUT_BURRACO` se manca un Burraco e con
  `CANNOT_CLOSE_WITH_WILDCARD` se lo scarto finale è un jolly o una pinella. In
  quest'ultimo caso l'errore relativo alla matta ha precedenza e la presenza del
  Burraco non viene valutata.
- Come nelle altre validazioni del motore digitale, le chiusure irregolari vengono
  respinte prima di qualsiasi mutation. Non sono simulate le procedure arbitrali di
  ripristino delle carte o le penalità previste per il gioco fisico.
- Questa milestone rappresenta esclusivamente la conclusione della smazzata: non
  determina un vincitore; il punteggio viene derivato separatamente come descritto
  nella milestone 9.

## Punteggio della smazzata — milestone 9

- Il punteggio viene calcolato in modo puro dallo stato concluso della smazzata e non
  viene mantenuto incrementalmente durante il gioco. Per ogni squadra il breakdown
  espone punti delle carte calate, bonus Burraco, bonus di chiusura, penalità delle
  carte in mano, penalità del pozzetto e totale.
- Le carte fisiche valgono: jolly 30 punti; pinella (2) 20; Asso 15; King, Queen,
  Jack, 10, 9 e 8 valgono 10; dal 7 al 3 valgono 5. Il valore dipende sempre dalla
  faccia fisica: il rango eventualmente rappresentato da una matta non viene usato.
- Tutte le carte fisiche nelle calate della squadra contribuiscono positivamente e le
  copie provenienti dai due mazzi vengono conteggiate separatamente.
- Ogni calata riceve il bonus derivato da `classifyBurraco`: pulito 200 punti,
  semipulito 150, sporco 100, non-Burraco 0. I bonus di più Burraco si sommano.
- La squadra indicata da `closingTeamId` riceve 100 punti di chiusura; l'altra non
  riceve alcun bonus di chiusura.
- Il valore delle carte rimaste nelle mani di entrambi i compagni è una penalità. Una
  squadra che non ha preso il pozzetto riceve inoltre 100 punti di penalità, ma solo
  se almeno una delle due squadre lo ha preso. Se nessuna squadra ha preso un
  pozzetto, la penalità fissa non si applica.
- Le penalità del breakdown sono magnitudini positive. La formula è:
  `total = meldCardPoints + burracoBonus + closingBonus - handPenalty - pozzettoPenalty`.
- Quando un pozzetto preso con lo scarto non è stato ancora giocato, le sue carte sono
  già nella mano digitale del giocatore e vengono quindi sottratte una sola volta come
  `handPenalty`; non esiste una seconda penalità per quelle stesse carte.

Non sono ancora implementati Victory Points, Match Points, punteggio cumulativo tra
più smazzate, soglia o vincitore della partita, punteggio da torneo, bonus e penalità
arbitrali, timeout e stallo. La conclusione per esaurimento del tallone è descritta
nella milestone 13.

## Tavolo locale giocabile — milestone 10

Questa sezione descrive il comportamento dell'applicazione, non introduce nuove
regole ufficiali di Burraco.

- L'interfaccia usa una modalità *hot-seat*: mostra integralmente soltanto la mano
  del giocatore indicato dal turno del motore, mentre gli altri tre posti mostrano
  nome, squadra e numero di carte. Al cambio turno, la mano visibile cambia
  automaticamente.
- Selezione, calata, legame e scarto identificano sempre le carte tramite l'ID della
  carta fisica. L'eventuale ordinamento visivo della mano non modifica lo stato né
  l'ordine conservato dal motore.
- Pesca, raccolta degli scarti, nuove calate, estensioni, scarto, presa del pozzetto,
  chiusura e punteggio restano delegati alle API del motore. L'interfaccia rappresenta
  lo stato restituito e mostra gli errori di regola senza applicare una propria copia
  delle regole.
- Tutti e quattro i giocatori sono controllati manualmente nello stesso dispositivo.
  Bot e strategie automatiche restano esplicitamente fuori da questa milestone. Questa
  modalità *hot-seat* è stata successivamente sostituita, come comportamento predefinito,
  dalla configurazione descritta nella milestone 11.

## Milestone 11 — bot deterministici

Questa sezione descrive un'astrazione di prodotto e una strategia automatica di base:
non aggiunge né modifica regole ufficiali FIBUR.

- `player-1` è l'unico giocatore umano. `player-2`, `player-3` e `player-4` sono
  controllati automaticamente; `player-3` resta il compagno dell'umano nella normale
  composizione a coppie.
- La mano interamente visibile e interattiva resta sempre quella di `player-1`. Per i
  bot il tavolo mostra soltanto nome, squadra e numero di carte; le carte diventano
  visibili soltanto quando entrano in una calata o nel monte degli scarti.
- Dopo lo scarto umano, i turni consecutivi dei bot vengono risolti immediatamente e
  senza ritardi artificiali finché il turno torna a `player-1` o la smazzata termina.
  La presa del pozzetto al volo non interrompe il bot: lo stesso turno continua finché
  il motore non lo fa avanzare.
- La strategia è pura, deterministica e volutamente elementare. A parità di
  `GameState`, percorre sempre nello stesso ordine giocatori, calate e carte; non usa
  casualità propria. In `mustDraw` pesca normalmente dal tallone e, soltanto se il
  tallone è vuoto, tenta di raccogliere il monte degli scarti.
- In fase `action` prova prima estensioni di una carta alle calate della propria
  squadra. Poi esamina in ordine stabile le combinazioni di tre carte della mano,
  usa `validateMeld` per trovare un seme valido e lo amplia avidamente con altre carte
  che mantengono valida la calata. Ripete finché non trova altre mosse semplici.
- Prima di conservare una calata o un'estensione candidata, verifica tramite il motore
  che rimanga almeno uno scarto finale legale. Per lo scarto prova le carte nell'ordine
  stabile della mano e sceglie la prima accettata dal motore.
- I bot non contengono una seconda implementazione delle regole. Pesca, raccolta,
  calata, estensione e scarto passano rispettivamente da `drawCard`,
  `takeDiscardPile`, `playMeld`, `extendMeld` e `discardCard`; il validatore e questi
  comandi restano l'unica autorità per turno, possesso, pozzetto, chiusura, matte,
  riscarto e validità delle calate.
- Limiti difensivi sul numero di azioni e sulla catena di turni trasformano un
  eventuale mancato progresso in un errore diagnostico, invece di permettere un ciclo
  infinito. Negli stati normali raggiungibili tali limiti non intervengono.

La strategia non cerca il gioco ottimale e non valuta convenienza del monte degli
scarti, valore delle carte, probabilità, avversari o cooperazione col compagno. Restano
rinviati anche livelli di difficoltà, personalità, configurazione del posto umano,
gioco di rete, persistenza e ogni altra euristica avanzata. Queste omissioni sono
funzionalità future, non regole di Burraco. La gestione ufficiale dell'esaurimento
del tallone è stata successivamente introdotta dalla milestone 13.

## Milestone 12 — bot strategici deterministici

Questa sezione descrive esclusivamente scelte di prodotto e di strategia automatica:
non introduce né modifica regole ufficiali FIBUR.

- I bot non si fermano più alla prima mossa valida. Generano un insieme limitato di
  estensioni di una carta e di nuove calate costruite da semi di tre carte, con limiti
  espliciti sul numero di semi e candidate. Ogni candidata passa comunque da
  `validateMeld`, `playMeld` o `extendMeld`; il motore resta l'unica autorità sulla
  legalità.
- Quando tallone e monte degli scarti sono entrambi disponibili, il bot raccoglie gli
  scarti soltanto se almeno una carta raccolta partecipa subito a una nuova calata o a
  un'estensione legale. In assenza di un vantaggio concreto preferisce il tallone. La
  decisione conosce del tallone soltanto la disponibilità e non ne osserva né simula
  la prossima carta.
- Le azioni sono confrontate con un ordinamento lessicografico stabile: chiusura
  immediatamente raggiungibile, presa del pozzetto, creazione o miglioramento di un
  Burraco, qualità del Burraco (`clean > semi-clean > dirty > none`), numero di carte
  giocate, conservazione delle matte, punti calati e tie-break deterministico. La
  chiusura legale ha priorità anche nella scelta dello scarto finale.
- Tutti gli scarti candidati vengono prima verificati con `discardCard`. Il ranking
  conserva jolly e pinelle, evita carte che possono ancora estendere le calate della
  squadra o partecipare a una calata valida con la mano, preferisce liberarsi di carte
  costose ma poco utili e, a parità strategica, evita di alimentare direttamente una
  calata avversaria visibile.
- La strategia usa esclusivamente la mano del bot e le informazioni pubbliche: calate
  di entrambe le squadre, monte degli scarti, conteggi delle mani, turno e stato
  pubblico del pozzetto. Non consulta identità delle carte avversarie, identità o
  ordine del tallone, né contenuto di un pozzetto non ancora acquisito. Una volta
  acquisito, il pozzetto è parte della mano del bot e può naturalmente essere giocato.
- A parità di stato pubblico e bot la scelta resta deterministica; non vengono usate
  casualità, probabilità sulle mani, lookahead profondo, minimax o simulazioni Monte
  Carlo. I limiti di candidate si aggiungono alle guardie sul numero di azioni per
  turno e di turni bot consecutivi, mantenendo la ricerca bounded.

## Milestone 13 — Esaurimento del tallone

### Fonte

- Codice di Gara FIBUR, ed. gennaio 2026 (Burraco tradizionale): art. 17 "Chiusure
  (tipologie e bonus)", caso della chiusura senza bonus per tallone esaurito; art. 18
  "Conteggio dei punti" per i negativi. La regola compare con formulazione
  equivalente nei Codici di Gara FIBUR e nel Codice di Gara Unico FGB (edizione
  gennaio 2018). I codici Burraco Internazionale e Burraco Revolution usano una
  numerazione diversa e non sono il riferimento del progetto.

### Regole ufficiali applicate

- Le ultime due carte del tallone non sono giocabili.
- Il giocatore che pesca la terzultima carta, portando il tallone da tre a due carte,
  completa normalmente il proprio turno: può calare, legare e prendere il pozzetto
  secondo le regole già descritte, e deve scartare.
- Se con quello scarto effettua una chiusura valida secondo la milestone 8, si applica
  la chiusura ordinaria con il relativo bonus.
- Altrimenti il suo scarto conclude la smazzata per esaurimento del tallone. Nessun
  giocatore può in seguito raccogliere il monte degli scarti per proseguire.
- Nel punteggio nessuna squadra riceve il bonus di chiusura. Il resto della
  milestone 9 resta invariato: valori delle carte calate, bonus Burraco, penalità per
  le carte in mano e regola esistente sulla penalità del pozzetto non preso.

### Astrazioni digitali dell'implementazione

- La smazzata conclusa distingue la chiusura ordinaria, che registra
  `closedByPlayerId` e `closingTeamId`, dall'esaurimento del tallone, che registra
  soltanto l'ID del giocatore il cui scarto l'ha conclusa.
- Dopo uno scarto che non chiude la smazzata, se il tallone contiene due carte o meno
  la smazzata passa allo stato `completed` per esaurimento. Una raccolta del monte
  degli scarti non modifica il tallone e quindi non attiva da sola la conclusione.
- Scelta di modellazione non esplicitata dal Codice: gli effetti ordinari dello scarto
  conclusivo si applicano prima della conclusione, compresa la presa del pozzetto con
  lo scarto. Un pozzetto preso in questo modo resta nella mano e le sue carte sono
  conteggiate negativamente, coerentemente con il "pozzetto preso e non giocato"
  dell'art. 18.
- Dopo la conclusione per esaurimento tutti i comandi di gioco sono rifiutati con
  `ROUND_COMPLETED`, come dopo una chiusura.

### Fuori ambito

- Stallo (art. 18), time out (art. 15), conclusione per decisione arbitrale e partita
  su più smazzate.

## Riproducibilità

Il motore riceve opzionalmente una sorgente pseudo-casuale. `createSeededRandom` usa
Mulberry32 e serve a produrre partite e test ripetibili. In produzione, in assenza di
una sorgente esplicita, viene usato `Math.random`.
