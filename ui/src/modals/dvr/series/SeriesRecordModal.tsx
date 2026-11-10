import Modal, { ModalProps } from '@/components/common/modal/Modal';

import Button from '@/components/common/button/Button';
import { DVRConfig } from '@/clients/api/api.types';
import Dropdown from '@/components/common/dropdown/Dropdown';
import styles from './SeriesRecordModal.module.scss';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SeriesOptions = {
  anyChannel: boolean;
  recordRepeats: boolean;
  configId?: string;
};

type Props = ModalProps & {
  title: string;
  channelName: string;
  profiles: Array<DVRConfig>;
  pending?: boolean;
  error?: string | null;
  onCreate: (opts: SeriesOptions) => void;
};

// Asks how a series rule should be made. The defaults are the cautious ones: this channel only, repeats skipped.
export default function SeriesRecordModal({
  title,
  channelName,
  profiles,
  pending,
  error,
  onCreate,
  ...rest
}: Props) {
  const { t } = useTranslation();
  const [anyChannel, setAnyChannel] = useState(false);
  const [skipRepeats, setSkipRepeats] = useState(true);
  const [profile, setProfile] = useState(profiles[0]?.id);

  return (
    <Modal {...rest}>
      <div className={styles.content}>
        <h3 className={styles.headline}>{t('record_series')}</h3>
        <p className={styles.hint}>{t('series_create_hint', { title })}</p>

        <fieldset className={styles.group}>
          <label className={styles.option}>
            <input
              type="radio"
              name="series-channel"
              checked={!anyChannel}
              onChange={() => setAnyChannel(false)}
              data-testid="series-channel-only"
            />
            {t('series_channel_only')} ({channelName})
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="series-channel"
              checked={anyChannel}
              onChange={() => setAnyChannel(true)}
              data-testid="series-any-channel"
            />
            {t('series_any_channel')}
          </label>
        </fieldset>

        <label className={styles.option}>
          <input
            type="checkbox"
            checked={skipRepeats}
            onChange={(e) => setSkipRepeats(e.target.checked)}
            data-testid="series-skip-repeats"
          />
          {t('series_skip_repeats')}
        </label>

        {profiles.length > 1 && (
          <Dropdown
            options={profiles.map((p) => ({
              title: p.name || t('default_profile'),
              value: p.id,
            }))}
            value={profile}
            onChange={setProfile}
            label={t('profile')}
            fullWidth
          />
        )}

        {error && <p className={styles.error}>{error}</p>}

        <Button
          label={t('record_series')}
          disabled={pending}
          loading={pending}
          testID="series-create-button"
          onClick={() =>
            onCreate({
              anyChannel,
              recordRepeats: !skipRepeats,
              configId: profiles.length > 1 ? profile : undefined,
            })
          }
        />
      </div>
    </Modal>
  );
}
