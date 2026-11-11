import * as Yup from 'yup';

import {
  LoaderFunctionArgs,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from 'react-router-dom';

import Button from '@/components/common/button/Button';
import DeleteConfirmationModal from '@/components/common/deleteConfirmationModal/DeleteConfirmationModal';
import EventChannelInfo from '@/components/epg/event/channelInfo/EventChannelInfo';
import Form from '@/components/common/form/Form';
import FormGroup from '@/components/common/form/FormGroup/FormGroup';
import Input from '@/components/common/input/Input';
import KeepMp4Option from '@/components/recordings/keep/KeepMp4Option';
import Pair from '@/components/common/pairList/Pair/Pair';
import PairKey from '@/components/common/pairList/PairKey/PairKey';
import PairList from '@/components/common/pairList/PairList';
import PairValue from '@/components/common/pairList/PairValue/PairValue';
import Player from '@/components/player/Player';
import { Recording } from '@/clients/api/api.types';
import { TestIds } from '@/__test__/ids';
import { downloadRecording } from '@/utils/download';
import { getRecording } from '@/clients/api/api';
import styles from './RecordingDetailView.module.scss';
import { useFormik } from 'formik';
import { useManageRecordingByEvent } from '@/hooks/recording';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;
  if (!id) {
    return;
  }

  return getRecording(id);
}

export function Component() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();

  const recording = useLoaderData() as Recording;
  const {
    cancelRecording,
    stopRecording,
    removeRecording,
    updateRecording,
    pending,
  } = useManageRecordingByEvent();

  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState<boolean>(false);
  const [noThumb, setNoThumb] = useState<boolean>(false);
  const [confirmationModalVisible, setConfirmationModalVisible] =
    useState<boolean>(false);
  const [keepMp4, setKeepMp4] = useState(false);

  const parseStatus = () => {
    switch (recording?.status) {
      case 'scheduled':
        return t('recording_scheduled');
      case 'recording':
        return t('recording_running');
      case 'completed':
        return t('recording_completed');
    }
    return t('recording_unknown');
  };

  const getCancelButtonLabel = () => {
    switch (recording?.status) {
      case 'scheduled':
        return t('cancel_recording');
      case 'recording':
        return t('stop_recording');
      case 'completed':
        return t('delete_recording');
    }
    return '';
  };

  const getConfirmationButtonLabel = () => {
    switch (recording?.status) {
      case 'scheduled':
        return t('cancel');
      case 'recording':
        return t('stop');
      case 'completed':
        return t('delete');
    }
    return '';
  };

  const getConfirmationModalTitle = () => {
    switch (recording?.status) {
      case 'scheduled':
        return t('confirm_cancel_recording');
      case 'recording':
        return t('confirm_stop_recording');
      case 'completed':
        return recording.kept
          ? t('confirm_delete_kept_recording')
          : recording.protected
            ? `${t('confirm_delete_recording')} ${t('confirm_delete_protected_note_one')}`
            : t('confirm_delete_recording');
    }
    return '';
  };

  const validationSchema = Yup.object().shape({
    startPadding: Yup.number(),
    endPadding: Yup.number(),
  });

  const handleDeleteOrStop = () => {
    if (recording?.status === 'recording') {
      stopRecording(recording.id, () => {
        setConfirmationModalVisible(false);
        revalidate();
      });
    } else if (recording?.status === 'scheduled') {
      cancelRecording(recording?.id, () => {
        navigate(-1);
      });
    } else if (recording?.status === 'completed') {
      removeRecording(
        recording.id,
        () => {
          navigate(-1);
        },
        keepMp4
      );
    }
  };

  const formik = useFormik({
    initialValues: {
      startPadding: recording?.startPadding || 0,
      endPadding: recording?.endPadding || 0,
    },
    validationSchema,
    onSubmit: ({ endPadding, startPadding }) => {
      if (!recording) {
        return;
      }

      updateRecording(recording.id, {
        endPadding,
        startPadding,
      });
    },
    enableReinitialize: true,
  });

  const renderCancelButton = () => {
    if (
      recording?.status === 'recording' ||
      recording?.status === 'scheduled' ||
      recording?.status === 'completed'
    ) {
      return (
        <Button
          type="button"
          label={getCancelButtonLabel()}
          style="red"
          onClick={() => setConfirmationModalVisible(true)}
        />
      );
    }
  };

  const renderProtectButton = () => {
    if (recording?.status === 'completed' && !recording.kept) {
      return (
        <Button
          type="button"
          quiet
          label={
            recording.protected ? `🔒 ${t('unprotect')}` : `${t('protect')}`
          }
          disabled={pending}
          onClick={() =>
            updateRecording(recording.id, {
              protected: !recording.protected,
            }).then(() => revalidate())
          }
        />
      );
    }
  };

  const renderPlayButton = () => {
    if (recording?.status === 'completed') {
      return (
        <Button label={`▶ ${t('play')}`} onClick={() => setPlaying(true)} />
      );
    }
  };

  const renderDownloadButton = () => {
    if (recording?.status === 'completed') {
      return (
        <Button
          label={
            downloadNote
              ? t('download_preparing', {
                  title: recording.title,
                  progress: downloadNote,
                })
              : t('download')
          }
          disabled={downloadNote !== null}
          onClick={() => {
            setDownloadNote('0');
            downloadRecording(recording, (p) =>
              setDownloadNote(p === null ? null : `${p}`)
            );
          }}
        />
      );
    }
  };

  const renderTimeForm = () => {
    if (
      recording?.status === 'scheduled' ||
      recording?.status === 'recording'
    ) {
      return (
        <Form
          onSubmit={formik.handleSubmit}
          className={styles.timeForm}
          maxWidth="20rem"
        >
          <FormGroup
            heading={t('recording_time')}
            info={t('recording_duration_padding_info')}
            direction="column"
          >
            <Input
              label={t('recording_minutes_before_start')}
              value={formik.values.startPadding}
              name="startPadding"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              disabled={recording.status === 'recording' || pending}
              type="number"
              selectTextOnFocus
            />
            <Input
              label={t('recording_minutes_after_end')}
              value={formik.values.endPadding}
              name="endPadding"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              type="number"
              disabled={pending}
              selectTextOnFocus
            />
          </FormGroup>
          <Button type="submit" label={t('save')} disabled={pending} />
        </Form>
      );
    }
  };

  return (
    <div className={styles.RecordingDetailView}>
      <DeleteConfirmationModal
        visible={confirmationModalVisible}
        onClose={() => setConfirmationModalVisible(false)}
        onConfirm={handleDeleteOrStop}
        title={getConfirmationModalTitle()}
        buttonTitle={getConfirmationButtonLabel()}
        pending={pending}
      >
        {recording.status === 'completed' && !recording.kept && (
          <KeepMp4Option checked={keepMp4} onChange={setKeepMp4} />
        )}
      </DeleteConfirmationModal>

      <Button
        label={`‹ ${t('go_back')}`}
        quiet
        style="text"
        className={styles.back}
        onClick={() => navigate(-1)}
        testID={TestIds.RECORDING_BACK_BUTTON}
      />

      <EventChannelInfo
        channelName={recording.channelName}
        picon={`/api/picon/${recording.piconId}`}
      />
      {!noThumb && (
        <img
          className={styles.thumb}
          src={`/api/recordings/${recording.id}/thumb`}
          alt=""
          onError={() => setNoThumb(true)}
        />
      )}
      <h2>{recording.title}</h2>
      {recording.kept && <p>{t('kept_hint')}</p>}
      {recording.protected && <p>{t('protected_hint')}</p>}
      <PairList>
        <Pair>
          <PairKey>{t('subtitle')}</PairKey>
          <PairValue>{recording.subtitle}</PairValue>
        </Pair>
        <Pair>
          <PairKey>{t('airs')}</PairKey>
          <PairValue>{t('event_datetime', { event: recording })}</PairValue>
        </Pair>
        <Pair>
          <PairKey>{t('status')}</PairKey>
          <PairValue>{parseStatus()}</PairValue>
        </Pair>
        <Pair>
          <PairKey>{t('description')}</PairKey>
          <PairValue>{recording.description}</PairValue>
        </Pair>
      </PairList>

      <div className={styles.actions}>
        {renderPlayButton()}
        {renderCancelButton()}
        {renderDownloadButton()}
        {renderProtectButton()}
      </div>
      {playing && (
        <Player
          visible
          onClose={() => setPlaying(false)}
          title={recording.title}
          recordingId={recording.id}
        />
      )}

      {renderTimeForm()}
    </div>
  );
}

Component.displayName = 'RecordingDetailView';
