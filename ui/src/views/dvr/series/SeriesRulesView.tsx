import {
  deleteAutorec,
  getAutorecs,
  setAutorecEnabled,
} from '@/clients/api/api';
import { useLoaderData, useRevalidator } from 'react-router-dom';

import { Autorec } from '@/clients/api/api.types';
import Badge from '@/components/common/badge/Badge';
import Button from '@/components/common/button/Button';
import DeleteConfirmationModal from '@/components/common/deleteConfirmationModal/DeleteConfirmationModal';
import EmptyState from '@/components/common/emptyState/EmptyState';
import Headline from '@/components/common/headline/Headline';
import styles from './SeriesRulesView.module.scss';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function loader() {
  return getAutorecs();
}

export function Component() {
  const { t } = useTranslation();
  const rules = useLoaderData() as Autorec[];
  const { revalidate } = useRevalidator();
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<Autorec | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
      revalidate();
    }
  };

  const duplicates = (rule: Autorec) => {
    switch (rule.duplicates) {
      case 'all':
        return t('series_dup_all');
      case 'skip_repeats':
        return t('series_dup_skip');
      case 'dvr_config':
        return t('series_dup_dvr');
      default:
        return t('series_dup_other');
    }
  };

  return (
    <div className={styles.view}>
      <DeleteConfirmationModal
        visible={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await run(() => deleteAutorec(toDelete.id));
          }
          setToDelete(null);
        }}
        title={t('series_delete_confirm')}
        buttonTitle={t('delete')}
        pending={pending}
      />

      <Headline>{t('series_rules')}</Headline>
      <p className={styles.intro}>{t('series_intro')}</p>

      {rules.length === 0 ? (
        <EmptyState title={t('series_none')} />
      ) : (
        <div className={styles.list}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={styles.rule}
              data-testid="series-rule"
              data-enabled={rule.enabled}
            >
              <div className={styles.text}>
                <span className={styles.title}>
                  {rule.isPattern
                    ? t('series_pattern', { pattern: rule.title })
                    : t('series_every', { title: rule.plainTitle })}{' '}
                  {rule.channelName
                    ? t('series_on_channel', { channel: rule.channelName })
                    : t('series_on_any_channel')}
                </span>
                <span className={styles.badges}>
                  <Badge color="default">{duplicates(rule)}</Badge>
                  {!rule.enabled && (
                    <Badge color="warning">{t('series_disabled')}</Badge>
                  )}
                </span>
              </div>
              <div className={styles.actions}>
                <Button
                  label={
                    rule.enabled ? t('series_disable') : t('series_enable')
                  }
                  quiet
                  disabled={pending}
                  onClick={() =>
                    run(() => setAutorecEnabled(rule.id, !rule.enabled))
                  }
                />
                <Button
                  label={t('delete')}
                  style="red"
                  quiet
                  disabled={pending}
                  onClick={() => setToDelete(rule)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Component.displayName = 'SeriesRulesView';
