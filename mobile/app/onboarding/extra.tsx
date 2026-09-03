/**
 * Onboarding 6/6 — giorno a spesa zero, poi si genera.
 *
 * L'ultimo passo non naviga a un'altra domanda: manda alla schermata di
 * elaborazione, che è dove il piano viene davvero costruito.
 */

import { useRouter } from "expo-router";
import { Choice, Note, Step } from "../../src/components/onboarding";
import { useSession } from "../../src/lib/state/session";

export default function ExtraScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useSession();

  return (
    <Step
      step="extra"
      title="Un giorno a spesa zero?"
      subtitle="Un giorno alla settimana si cucina solo con avanzi e dispensa. Si risparmia parecchio."
      canNext
      nextLabel="Crea il piano"
      onNext={() => router.replace("/elaborazione")}
    >
      <Choice
        label="Sì, mettiamolo"
        hint="Un giorno con avanzi e quello che c'è in casa"
        selected={profile.zeroSpendDay === true}
        onPress={() => updateProfile({ zeroSpendDay: true })}
      />
      <Choice
        label="No, grazie"
        hint="Sette giorni di pasti completi"
        selected={profile.zeroSpendDay === false}
        onPress={() => updateProfile({ zeroSpendDay: false })}
      />

      <Note>
        I prezzi mostrati sono stime indicative per il tuo paese e servono a organizzare la
        spesa dentro il budget. Non sono rilevazioni dai supermercati: dalla lista potrai
        verificare il prezzo reale di ogni prodotto.
      </Note>
    </Step>
  );
}
