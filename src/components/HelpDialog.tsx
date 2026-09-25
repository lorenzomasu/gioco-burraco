import { Dialog } from './Dialog'

type HelpDialogProps = Readonly<{ onClose: () => void }>

/**
 * Concise guide to the implemented digital flow only. Legality stays with the engine, so
 * the text describes controls and outcomes without restating detailed meld rules.
 */
export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <Dialog title="Come si gioca" onClose={onClose} className="dialog--help">
      <section aria-labelledby="help-match">
        <h3 id="help-match">La partita</h3>
        <p>
          Giochi in coppia con un bot compagno contro due bot avversari. La partita dura 2, 3 o 4
          smazzate, a scelta all'inizio (4 se non la cambi), e vince la squadra con il punteggio cumulativo più alto. La partita in corso è
          salvata in questo browser e riprende automaticamente quando riapri la pagina.
        </p>
      </section>
      <section aria-labelledby="help-turn">
        <h3 id="help-turn">Il tuo turno</h3>
        <ol>
          <li>Pesca una carta dal <strong>tallone</strong> oppure raccogli tutto il <strong>monte degli scarti</strong>.</li>
          <li>
            Seleziona le carte: con <strong>«Cala»</strong> apri una nuova calata, con
            <strong> «Aggiungi alla calata»</strong> le aggiungi a una calata della tua squadra.
          </li>
          <li>Seleziona una sola carta e premi <strong>«Scarta e passa»</strong> per finire il turno.</li>
        </ol>
        <p>
          Puoi anche trascinare le carte (mouse o tocco prolungato) sugli scarti, su «Nuova calata» o su
          una calata della tua squadra, e riordinare la mano trascinandole o con «Sposta» e «Ordina mano».
          Pulsanti e tastiera restano sempre disponibili al posto del trascinamento. Se una mossa non è
          valida, il gioco lo spiega e non cambia nulla.
        </p>
      </section>
      <section aria-labelledby="help-table">
        <h3 id="help-table">Pozzetto e Burraco</h3>
        <p>
          Quando una squadra finisce le carte in mano prende il suo <strong>pozzetto</strong>, una seconda
          mano di carte coperte: accanto alle calate compare «Pozzetto preso». Una calata di almeno sette
          carte è un <strong>Burraco</strong> (pulito, semipulito o sporco, come indicato sul badge). Per
          chiudere la smazzata una squadra deve aver preso il pozzetto e avere almeno un Burraco.
        </p>
      </section>
      <section aria-labelledby="help-bots">
        <h3 id="help-bots">Turni dei bot</h3>
        <p>
          I bot giocano da soli una mossa alla volta; la cronologia mostra le loro mosse pubbliche.
          Usa <strong>«Completa subito»</strong> per concludere subito le loro mosse, e le Impostazioni per
          scegliere la velocità.
        </p>
      </section>
    </Dialog>
  )
}
