import Button from '@/components/common/button/Button';
import Modal from '@/components/common/modal/Modal';
import { ReactNode } from 'react';
import { TestIds } from '@/__test__/ids';
import styles from './DeleteConfirmationModal.module.scss';
import { useTranslation } from 'react-i18next';

type Props = {
  title?: string | null | undefined;
  buttonTitle?: string | null | undefined;
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
  // extra content between the title and the button (e.g. a "keep the MP4 copy" checkbox)
  children?: ReactNode;
};

const DeleteConfirmationModal = ({
  visible,
  onClose,
  onConfirm,
  title,
  buttonTitle,
  pending,
  children,
}: Props) => {
  const { t } = useTranslation();

  return (
    <Modal onClose={onClose} visible={visible} maxWidth="25rem">
      <div className={styles.content}>
        {title ? <h3 className={styles.headline}>{title}</h3> : <></>}
        {children}
        <Button
          disabled={pending}
          label={buttonTitle || t('delete')}
          style="red"
          onClick={onConfirm}
          testID={TestIds.CONFIRM_DELETE_BUTTON}
        />
      </div>
    </Modal>
  );
};

export default DeleteConfirmationModal;
