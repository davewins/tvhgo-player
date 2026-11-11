import { CreateRecordingOpts, UpdateRecording } from '@/clients/api/api.types';
import {
  cancelRecording,
  cancelRecordings,
  createRecording,
  recordByEvent,
  removeRecording,
  removeRecordings,
  stopRecording,
  stopRecordings,
  updateRecording,
} from '@/clients/api/api';

import { useNotification } from './notification';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// "nothing deleted: there is no MP4 copy to keep" comes back from the server as a 409 with a readable message
function keepError(e: unknown): string | undefined {
  const r = (
    e as { response?: { status?: number; data?: { message?: string } } }
  ).response;
  return r?.status === 409 ? r.data?.message : undefined;
}

export const useManageRecordingByEvent = () => {
  const { notifyError, notifySuccess, dismissNotification } = useNotification(
    'manageRecordingByEvent'
  );

  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const createRecording = async (eventId: number, configId?: string) => {
    dismissNotification();
    setPending(true);
    return await recordByEvent(eventId, configId)
      .then(() => {
        notifySuccess(t('recording_created'));
      })
      .catch(() => {
        notifyError(t('unexpected'));
      })
      .finally(() => {
        setPending(false);
      });
  };

  const _cancelRecording = async (id: string, success?: () => void) => {
    dismissNotification();
    setPending(true);
    return await cancelRecording(id)
      .then(() => {
        notifySuccess(t('recording_canceled'));
        if (success) success();
      })
      .catch(() => {
        notifyError(t('unexpected'));
      })
      .finally(() => {
        setPending(false);
      });
  };

  const _stopRecording = async (id: string, success?: () => void) => {
    dismissNotification();
    setPending(true);
    return await stopRecording(id)
      .then(() => {
        notifySuccess(t('recording_stopped'));
        if (success) success();
      })
      .catch(() => {
        notifyError(t('unexpected'));
      })
      .finally(() => {
        setPending(false);
      });
  };

  const _removeRecording = async (
    id: string,
    success?: () => void,
    keepMp4 = false
  ) => {
    dismissNotification();
    setPending(true);
    return await removeRecording(id, keepMp4)
      .then(() => {
        notifySuccess(
          t(keepMp4 ? 'recording_removed_kept' : 'recording_removed')
        );
        if (success) success();
      })
      .catch((e) => {
        notifyError(keepError(e) ?? t('unexpected'));
      })
      .finally(() => {
        setPending(false);
      });
  };

  const _updateRecording = async (id: string, opts: UpdateRecording) => {
    dismissNotification();
    setPending(true);
    return await updateRecording(id, opts)
      .then(() => {
        notifySuccess(t('recording_updated'));
      })
      .catch(() => {
        notifyError(t('unexpected'));
      })
      .finally(() => {
        setPending(false);
      });
  };

  return {
    createRecording,
    cancelRecording: _cancelRecording,
    stopRecording: _stopRecording,
    removeRecording: _removeRecording,
    updateRecording: _updateRecording,
    pending,
  };
};

export const useManageRecordings = () => {
  const { notifyError, notifySuccess, dismissNotification } =
    useNotification('manageRecordings');

  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const stopAndCancelRecordings = async (
    stopIds: string[],
    cancelIds: string[]
  ) => {
    dismissNotification();
    setPending(true);

    const promises = [];
    if (stopIds.length > 0) {
      promises.push(stopRecordings(stopIds));
    }

    if (cancelIds.length > 0) {
      promises.push(cancelRecordings(cancelIds));
    }

    return await Promise.all(promises)
      .then(() => {
        notifySuccess(t('recordings_stopped_canceled'));
      })
      .catch(() => {
        notifyError(t('unexpected'));
      })
      .finally(() => {
        setPending(false);
      });
  };

  // resolves to true when the recordings were removed
  const _removeRecordings = async (ids: string[], keepMp4 = false) => {
    dismissNotification();
    setPending(true);

    return await removeRecordings(ids, keepMp4)
      .then(() => {
        notifySuccess(
          t(keepMp4 ? 'recordings_removed_kept' : 'recordings_removed')
        );
        return true;
      })
      .catch((e) => {
        notifyError(keepError(e) ?? t('unexpected'));
        return false;
      })
      .finally(() => {
        setPending(false);
      });
  };

  return {
    stopAndCancelRecordings,
    removeRecordings: _removeRecordings,
    pending,
  };
};

export const useCreateRecording = (): [
  (opts: CreateRecordingOpts) => Promise<void>,
  boolean,
] => {
  const { notifyError, notifySuccess, dismissNotification } =
    useNotification('createRecording');

  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const _createRecording = (opts: CreateRecordingOpts) => {
    dismissNotification();
    setPending(true);

    return createRecording(opts)
      .then(() => {
        notifySuccess(t('recording_created_successfully'));
      })
      .catch((err) => {
        notifyError(t('unexpected'));
        throw err;
      })
      .finally(() => {
        setPending(false);
      });
  };

  return [_createRecording, pending];
};
