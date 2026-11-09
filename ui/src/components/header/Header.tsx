import { BurgerMenuIcon, SearchIcon, TvhgoHorizontalLogo } from '@/assets';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';

import Input from '../common/input/Input';
import styles from './Header.module.scss';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';

type Props = {
  onToggle: () => void;
};

function Header({ onToggle }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSearch = useMatch(`/search`);
  const isChannels = useMatch(`/channels`);
  const [searchParams, setSearchParams] = useSearchParams();

  const searchForm = useFormik({
    initialValues: {
      query: isSearch || isChannels ? searchParams.get('q') || '' : '',
    },
    onSubmit: ({ query }) => navigate(`/search?q=${encodeURIComponent(query)}`),
    enableReinitialize: true,
  });

  const renderSearch = () => {
    return (
      <form onSubmit={searchForm.handleSubmit}>
        <Input
          name="query"
          icon={<SearchIcon />}
          placeholder={isChannels ? t('guide_search') : t('search')}
          value={searchForm.values.query}
          onChange={(e) => {
            searchForm.handleChange(e);
            if (isChannels) {
              // on the Channels page the guide filters live as you type; Enter searches the whole guide
              const value = e.target.value;
              setSearchParams(
                (prev) => {
                  if (value) {
                    prev.set('q', value);
                  } else {
                    prev.delete('q');
                  }
                  return prev;
                },
                { replace: true }
              );
            }
          }}
          onBlur={searchForm.handleBlur}
        />
      </form>
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <div className={styles.left}>
          <BurgerMenuIcon
            className={styles.menuIcon}
            onClick={() => onToggle()}
          />
          <TvhgoHorizontalLogo className={styles.logo} />
        </div>
        <div className={styles.right}>{renderSearch()}</div>
      </div>
    </div>
  );
}

export default Header;
