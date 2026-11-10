import { Autorec, DVRConfig, EpgEvent } from '@/clients/api/api.types';
import {
  LoaderFunctionArgs,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from 'react-router-dom';
import {
  createAutorec,
  getAutorecs,
  getDVRConfigs,
  getEpgEvent,
  getRelatedEpgEvents,
} from '@/clients/api/api';

import DVRProfileSelectModal from '@/modals/dvr/profile/DVRProfileSelectModal';
import EventChannelInfo from '@/components/epg/event/channelInfo/EventChannelInfo';
import EventInfo from '@/components/epg/event/info/EventInfo';
import EventRelated from '@/components/epg/event/related/EventRelated';
import SeriesRecordModal from '@/modals/dvr/series/SeriesRecordModal';
import { coveringRule } from '@/utils/autorec';
import styles from './EventView.module.scss';
import { useManageRecordingByEvent } from '@/hooks/recording';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) {
    return;
  }

  const id = parseInt(params.id);
  if (!id) {
    return;
  }

  const [event, related, dvrProfiles, autorecs] = await Promise.all([
    getEpgEvent(id),
    getRelatedEpgEvents(id),
    getDVRConfigs(),
    // series rules only add information here: do not fail the page without them
    getAutorecs().catch(() => [] as Autorec[]),
  ]);

  return [
    event,
    related.entries.filter((r) => r.id !== id),
    dvrProfiles,
    autorecs,
  ];
}

export function Component() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { createRecording, pending } = useManageRecordingByEvent();
  const { t } = useTranslation();
  const [event, relatedEvents, dvrProfiles, autorecs] = useLoaderData() as [
    EpgEvent,
    Array<EpgEvent>,
    Array<DVRConfig>,
    Array<Autorec>,
  ];

  const [modalVisible, setModalVisible] = useState(false);
  const [seriesVisible, setSeriesVisible] = useState(false);
  const [seriesPending, setSeriesPending] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const seriesRule = coveringRule(autorecs || [], event);

  const handleCreateSeries = async (opts: {
    anyChannel: boolean;
    recordRepeats: boolean;
    configId?: string;
  }) => {
    setSeriesPending(true);
    setSeriesError(null);
    try {
      await createAutorec({ eventId: event.id, ...opts });
      setSeriesVisible(false);
      revalidator.revalidate();
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      setSeriesError(status === 409 ? t('series_exists') : t('series_failed'));
    } finally {
      setSeriesPending(false);
    }
  };

  const handleCreateRecording = async (profileId?: string) => {
    await createRecording(event.id, profileId);
    revalidator.revalidate();
  };

  const handleOnRecord = async () => {
    if (!event) {
      return;
    }

    if (event.dvrUuid) {
      navigate(`/dvr/recordings/${event.dvrUuid}`);
      return;
    }

    if (dvrProfiles.length > 1) {
      setModalVisible(true);
      return;
    }

    handleCreateRecording();
  };

  return (
    <div className={styles.Event}>
      <DVRProfileSelectModal
        disableBackdropClose
        disableEscapeClose
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        profiles={dvrProfiles}
        maxWidth="25rem"
        handleCreateRecording={handleCreateRecording}
      />

      <SeriesRecordModal
        visible={seriesVisible}
        onClose={() => setSeriesVisible(false)}
        maxWidth="30rem"
        title={event.title}
        channelName={event.channelName}
        profiles={dvrProfiles}
        pending={seriesPending}
        error={seriesError}
        onCreate={handleCreateSeries}
      />

      <EventChannelInfo
        channelName={event.channelName}
        picon={`/api/picon/${event.piconId}`}
      />
      <EventInfo
        event={event}
        handleOnRecord={handleOnRecord}
        pending={pending}
        onRecordSeries={() => {
          setSeriesError(null);
          setSeriesVisible(true);
        }}
        seriesRule={seriesRule}
      />
      <EventRelated relatedEvents={relatedEvents} />
    </div>
  );
}

Component.displayName = 'EventView';
