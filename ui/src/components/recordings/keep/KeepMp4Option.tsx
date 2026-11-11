import Checkbox from '@/components/common/checkbox/Checkbox';
import styles from './KeepMp4Option.module.scss';
import { useTranslation } from 'react-i18next';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

// "Delete the recording but keep the converted MP4 (it stays in the Jellyfin library)"
export default function KeepMp4Option({ checked, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className={styles.option} data-testid="keep-mp4">
      <Checkbox checked={checked} onChange={onChange} />
      <label onClick={() => onChange(!checked)}>
        <strong>{t('keep_mp4')}</strong>
        <span>{t('keep_mp4_hint')}</span>
      </label>
    </div>
  );
}
