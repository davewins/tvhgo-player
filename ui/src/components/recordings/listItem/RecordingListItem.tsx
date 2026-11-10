import Checkbox from '@/components/common/checkbox/Checkbox';
import { Recording } from '@/clients/api/api.types';
import { TestIds } from '@/__test__/ids';
import styles from './RecordingListItem.module.scss';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  recording: Recording;
  onClick: () => void;
  // play straight from the picture (finished recordings)
  onPlay?: () => void;
  onSelection: (selected: boolean) => void;
  selected: boolean;
};

function renderTitle(title: string, subtitle?: string) {
  return `${title}${subtitle ? ` (${subtitle})` : ''}`;
}

function RecordingListItem({
  recording,
  selected,
  onClick,
  onPlay,
  onSelection,
}: Props) {
  const { t } = useTranslation();
  const [noThumb, setNoThumb] = useState(false);

  const renderRecIndicator = () => {
    if (recording.status === 'recording') {
      return (
        <div
          title={t('recording_running') || ''}
          className={styles.recIndicator}
        />
      );
    }
  };

  return (
    <div className={styles.RecordingListItem} tabIndex={0}>
      <div className={styles.thumbWrap}>
        {noThumb ? (
          <div className={styles.thumb} onClick={onPlay ?? onClick} />
        ) : (
          <img
            className={styles.thumb}
            src={`/api/recordings/${recording.id}/thumb`}
            alt=""
            loading="lazy"
            onClick={onPlay ?? onClick}
            onError={() => setNoThumb(true)}
          />
        )}
        {onPlay && (
          <span className={styles.playIcon} aria-hidden="true">
            ▶
          </span>
        )}
      </div>
      <div
        className={styles.link}
        onClick={onClick}
        title={renderTitle(recording.title, recording.subtitle)}
      >
        <span className={styles.title}>
          {renderTitle(recording.title, recording.subtitle)}
        </span>
        <div className={styles.secondary}>
          {renderRecIndicator()}
          <span>
            {recording.channelName} |{' '}
            {t('event_datetime', { event: recording })}
          </span>
        </div>
      </div>

      <Checkbox
        onChange={(checked) => onSelection(checked)}
        checked={selected}
        testId={TestIds.SELECT_RECORDING_CHECKBOX}
      />
    </div>
  );
}

export default RecordingListItem;
