import { Autorec, EpgEvent } from '@/clients/api/api.types';

import EventRecordButton from '../recordButton/EventRecordButton';
import { NavLink } from 'react-router-dom';
import Pair from '@/components/common/pairList/Pair/Pair';
import PairKey from '@/components/common/pairList/PairKey/PairKey';
import PairList from '@/components/common/pairList/PairList';
import PairValue from '@/components/common/pairList/PairValue/PairValue';
import styles from './EventInfo.module.scss';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  event: EpgEvent;
  pending: boolean;
  handleOnRecord: () => void;
  // record every episode: opens the series dialog
  onRecordSeries?: () => void;
  // the series rule that already covers this programme, if any
  seriesRule?: Autorec;
};

function EventInfo({
  event,
  handleOnRecord,
  pending,
  onRecordSeries,
  seriesRule,
}: Props) {
  const { t } = useTranslation();
  // artwork for the programme (TMDb, if configured); shown only when there is some
  const [noArt, setNoArt] = useState(false);

  return (
    <div className={styles.EventInfo}>
      {!noArt && (
        <img
          className={styles.art}
          src={`/api/epg/events/${event.id}/thumb`}
          alt=""
          onError={() => setNoArt(true)}
        />
      )}
      <h1 className={styles.title}>{event.title}</h1>
      <div className={styles.actions}>
        <EventRecordButton
          pending={pending}
          onClick={handleOnRecord}
          dvrUuid={event.dvrUuid}
        />
        {onRecordSeries && !seriesRule && (
          <button
            type="button"
            className={styles.seriesButton}
            onClick={onRecordSeries}
            data-testid="record-series-button"
          >
            {t('record_series')}
          </button>
        )}
      </div>
      {seriesRule && (
        <p className={styles.series} data-testid="series-covered">
          {t('series_covered')}:{' '}
          {t('series_every', { title: seriesRule.plainTitle })}{' '}
          {seriesRule.channelName
            ? t('series_on_channel', { channel: seriesRule.channelName })
            : t('series_on_any_channel')}{' '}
          · <NavLink to="/dvr/series">{t('series_manage')}</NavLink>
        </p>
      )}
      <PairList>
        <Pair>
          <PairKey>{t('subtitle')}</PairKey>
          <PairValue>{event.subtitle}</PairValue>
        </Pair>
        <Pair>
          <PairKey>{t('airs')}</PairKey>
          <PairValue>{t('event_datetime', { event })}</PairValue>
        </Pair>
        <Pair>
          <PairKey>{t('description')}</PairKey>
          <PairValue>{event.description}</PairValue>
        </Pair>
      </PairList>
    </div>
  );
}

export default EventInfo;
