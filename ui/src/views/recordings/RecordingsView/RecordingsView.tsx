import {
  EpisodeSort,
  ShowSort,
  findShow,
  groupShows,
  sortEpisodes,
  sortShows,
} from '@/utils/shows';
import { EpisodeTile, ShowTile } from '@/components/recordings/tiles/Tiles';
import { ListResponse, Recording } from '@/clients/api/api.types';
import {
  LoaderFunctionArgs,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from 'react-router-dom';
import { RecordingStatus, getRecordings } from '@/clients/api/api';
import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/button/Button';
import Checkbox from '@/components/common/checkbox/Checkbox';
import DeleteConfirmationModal from '@/components/common/deleteConfirmationModal/DeleteConfirmationModal';
import Dropdown from '@/components/common/dropdown/Dropdown';
import EmptyState from '@/components/common/emptyState/EmptyState';
import { LargeArrowLeftIcon } from '@/assets';
import PaginationControls from '@/components/common/paginationControls/PaginationControls';
import RecordingListItem from '@/components/recordings/listItem/RecordingListItem';
import { TestIds } from '@/__test__/ids';
import { c } from '@/utils/classNames';
import styles from './RecordingsView.module.scss';
import { useManageRecordings } from '@/hooks/recording';
import { usePagination } from '@/hooks/pagination';
import { useTranslation } from 'react-i18next';

export enum RecordingsViewRefreshStates {
  CREATED = 'recording_created',
}

const defaultLimit = 50;
// the shows view groups on the client, so it needs every finished recording, not one page
const allLimit = 2000;
const LAYOUT_KEY = 'tvhgo.recordingsLayout';

type Layout = 'grid' | 'list';

function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const query = new URL(request.url).searchParams;

  if (
    (query.get('status') || 'finished') === 'finished' &&
    query.get('view') !== 'list'
  ) {
    return getRecordings({
      limit: allLimit,
      offset: 0,
      // eslint-disable-next-line camelcase
      sort_key: 'startsAt',
      // eslint-disable-next-line camelcase
      sort_dir: 'desc',
      status: 'finished',
    });
  }

  return getRecordings({
    limit: defaultLimit,
    offset: parseInt(query.get('offset')!) || 0,
    // eslint-disable-next-line camelcase
    sort_key: query.get('sortKey') || 'startsAt',
    // eslint-disable-next-line camelcase
    sort_dir: query.get('sortDir') || 'asc',
    status: (query.get('status') as RecordingStatus) || 'finished',
  });
}

export function Component() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { revalidate } = useRevalidator();
  const [queryParams, setQueryParams] = useSearchParams();
  const [selectedRecordings, setSelectedRecordings] = useState<Set<Recording>>(
    new Set()
  );
  const clearSelection = () => setSelectedRecordings(new Set());
  const [confirmationModalVisible, setConfirmationModalVisible] =
    useState<boolean>(false);

  const { limit, nextPage, previousPage, getOffset, firstPage, lastPage } =
    usePagination(defaultLimit, queryParams, setQueryParams);

  const { stopAndCancelRecordings, removeRecordings, pending } =
    useManageRecordings();

  const getStatus = () =>
    (queryParams.get('status') as RecordingStatus) || 'finished';

  const sortKey = useMemo(
    () => queryParams.get('sortKey') || 'startsAt',
    [queryParams]
  );

  const sortDir = useMemo(
    () => queryParams.get('sortDir') || 'asc',
    [queryParams]
  );

  const { entries, total } = useLoaderData() as ListResponse<Recording>;

  // finished recordings are shown grouped by show (like Sky Q) unless the flat list is asked for
  const grouped =
    getStatus() === 'finished' && queryParams.get('view') !== 'list';
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      // ignore (private mode etc.)
    }
  };
  const shows = useMemo(
    () => (grouped ? groupShows(entries) : []),
    [grouped, entries]
  );
  const currentShow = grouped
    ? findShow(shows, queryParams.get('show'))
    : undefined;
  const groupSort = queryParams.get('sort') || 'newest';
  const shownRecordings = useMemo(
    () =>
      grouped
        ? currentShow
          ? sortEpisodes(currentShow.episodes, groupSort as EpisodeSort)
          : []
        : entries,
    [grouped, currentShow, groupSort, entries]
  );
  const setParam = (key: string, value: string | null) =>
    setQueryParams((prev) => {
      if (value === null) {
        prev.delete(key);
      } else {
        prev.set(key, value);
      }
      return prev;
    });
  const openShow = (title: string) => {
    clearSelection();
    setQueryParams((prev) => {
      prev.set('show', title);
      return prev;
    });
  };

  useEffect(() => {
    switch (state) {
      case RecordingsViewRefreshStates.CREATED:
        revalidate();
        break;
    }
  }, [state, revalidate]);

  const getDeleteOrCancelButtonLabel = () => {
    return getStatus() === 'upcoming' ? t('cancel') : t('delete');
  };

  const getConfirmationModalTitle = () => {
    return getStatus() === 'upcoming'
      ? t('confirm_cancel_recordings')
      : t('confirm_delete_recordings');
  };

  const renderRecordings = () => {
    if (entries.length === 0) {
      return <EmptyState title={t('no_recordings')} />;
    }

    if (grouped && !currentShow) {
      const sorted = sortShows(shows, groupSort as ShowSort);
      return (
        <div className={layout === 'grid' ? styles.grid : styles.stack}>
          {sorted.map((show) => (
            <ShowTile
              key={show.title.toLowerCase()}
              show={show}
              layout={layout}
              onOpen={() => openShow(show.title)}
            />
          ))}
        </div>
      );
    }

    if (grouped && layout === 'grid') {
      return (
        <div className={styles.grid}>
          {shownRecordings.map((recording) => (
            <EpisodeTile
              key={recording.id}
              recording={recording}
              onOpen={() => navigate(`/dvr/recordings/${recording.id}`)}
              onSelection={(selected) =>
                setSelectedRecordings((prv) =>
                  selected
                    ? new Set([...prv, recording])
                    : new Set([...prv].filter((v) => v.id !== recording.id))
                )
              }
              selected={selectedRecordings.has(recording)}
            />
          ))}
        </div>
      );
    }

    return shownRecordings.map((recording) => (
      <RecordingListItem
        key={recording.id}
        recording={recording}
        onClick={() => {
          navigate(`/dvr/recordings/${recording.id}`);
        }}
        onSelection={(selected) => {
          setSelectedRecordings((prv) =>
            selected
              ? new Set([...prv, recording])
              : new Set([...prv].filter((v) => v.id !== recording.id))
          );
        }}
        selected={selectedRecordings.has(recording)}
      />
    ));
  };

  const handleDeleteOrCancelRecordings = () => {
    if (getStatus() === 'upcoming') {
      const stopIds = [...selectedRecordings]
        .filter((rec) => rec.status === 'recording')
        .map((rec) => rec.id);

      const cancelIds = [...selectedRecordings]
        .filter((rec) => rec.status !== 'recording')
        .map((rec) => rec.id);

      stopAndCancelRecordings(stopIds, cancelIds).then(() => {
        clearSelection();
        setConfirmationModalVisible(false);
        revalidate();
      });

      return;
    }

    removeRecordings([...selectedRecordings].map((rec) => rec.id)).then(() => {
      clearSelection();
      setConfirmationModalVisible(false);
      revalidate();
    });
  };

  return (
    <div className={styles.Recordings}>
      <DeleteConfirmationModal
        visible={confirmationModalVisible}
        onClose={() => setConfirmationModalVisible(false)}
        onConfirm={handleDeleteOrCancelRecordings}
        title={getConfirmationModalTitle()}
        buttonTitle={getDeleteOrCancelButtonLabel()}
        pending={pending}
      />

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Dropdown
            value={getStatus()}
            onChange={(value) => {
              clearSelection();
              setQueryParams({
                status: value,
              });
            }}
            testID={TestIds.RECORDINGS_STATUS_DROPDOWN}
            options={[
              {
                title: t('finished'),
                value: 'finished',
              },
              {
                title: t('upcoming'),
                value: 'upcoming',
              },
              {
                title: t('failed'),
                value: 'failed',
              },
            ]}
          />

          {grouped && currentShow && (
            <Button
              label={t('back_to_shows')}
              quiet
              style="text"
              onClick={() => {
                clearSelection();
                setParam('show', null);
              }}
              testID={TestIds.RECORDINGS_BACK_TO_SHOWS}
            />
          )}

          {grouped && (
            <>
              <Dropdown
                value={groupSort}
                onChange={(value) => setParam('sort', value)}
                testID={TestIds.RECORDINGS_SHOW_SORT_DROPDOWN}
                options={[
                  { title: t('sort_newest'), value: 'newest' },
                  { title: t('sort_oldest'), value: 'oldest' },
                  { title: t('sort_title'), value: 'title' },
                  ...(currentShow
                    ? []
                    : [{ title: t('sort_count'), value: 'count' }]),
                ]}
              />
              <div className={styles.layoutToggle} role="group">
                {(['grid', 'list'] as Layout[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={c(
                      styles.toggleButton,
                      layout === l ? styles.toggleActive : ''
                    )}
                    aria-pressed={layout === l}
                    data-testid={
                      l === 'grid'
                        ? TestIds.RECORDINGS_LAYOUT_GRID
                        : TestIds.RECORDINGS_LAYOUT_LIST
                    }
                    onClick={() => setLayout(l)}
                  >
                    {t(l === 'grid' ? 'layout_grid' : 'layout_list')}
                  </button>
                ))}
              </div>
            </>
          )}

          {!grouped && getStatus() === 'finished' && (
            <Button
              label={t('shows')}
              quiet
              style="text"
              onClick={() => setParam('view', null)}
              testID={TestIds.RECORDINGS_VIEW_TOGGLE}
            />
          )}
          {grouped && !currentShow && (
            <Button
              label={t('all_recordings')}
              quiet
              style="text"
              onClick={() => setParam('view', 'list')}
              testID={TestIds.RECORDINGS_VIEW_TOGGLE}
            />
          )}

          <div className={grouped ? styles.hidden : styles.sort}>
            <Dropdown
              value={sortKey}
              onChange={(value) => {
                setQueryParams((prev) => {
                  prev.set('sortKey', value);
                  return prev;
                });
              }}
              testID={TestIds.RECORDINGS_SORT_DROPDOWN}
              options={[
                {
                  title: t('sort_by.start_date'),
                  value: 'startsAt',
                },
                {
                  title: t('sort_by.end_date'),
                  value: 'endsAt',
                },
                {
                  title: t('sort_by.title'),
                  value: 'title',
                },
                {
                  title: t('sort_by.channel'),
                  value: 'channelName',
                },
              ]}
            />

            <Button
              quiet
              style="text"
              icon={
                <LargeArrowLeftIcon
                  className={c(
                    styles.sortDirIcon,
                    sortDir === 'desc' ? styles.desc : ''
                  )}
                />
              }
              onClick={() => {
                setQueryParams((prev) => {
                  prev.set(
                    'sortDir',
                    prev.get('sortDir') === 'desc' ? 'asc' : 'desc'
                  );
                  return prev;
                });
              }}
              testID={TestIds.RECORDINGS_SORT_DIR_BUTTON}
            />
          </div>

          <Button
            label={t('create_recording')}
            style="blue"
            className={c()}
            quiet
            onClick={() =>
              navigate('/dvr/recordings/create', {
                preventScrollReset: true,
              })
            }
          />
        </div>

        <div className={styles.actions}>
          <Button
            label={getDeleteOrCancelButtonLabel()}
            onClick={() => setConfirmationModalVisible(true)}
            style="red"
            disabled={pending}
            className={c(
              styles.deleteButton,
              selectedRecordings.size > 0 ? styles.deleteButtonVisible : ''
            )}
            testID={TestIds.DELETE_CANCEL_RECORDINGS_BUTTON}
            quiet
          />
          <Checkbox
            onChange={(checked) =>
              checked
                ? setSelectedRecordings(new Set(shownRecordings))
                : clearSelection()
            }
            className={styles.selectAll}
            checked={
              shownRecordings.length > 0 &&
              selectedRecordings.size === shownRecordings.length
            }
            indeterminate={selectedRecordings.size > 0}
            disabled={shownRecordings.length < 1}
            testId={TestIds.SELECT_ALL_RECORDINGS_CHECKBOX}
          />
        </div>
      </div>
      {grouped && currentShow && (
        <h2 className={styles.showTitle}>{currentShow.title}</h2>
      )}
      <div className={styles.recordings}>{renderRecordings()}</div>
      {!grouped && (
        <PaginationControls
          onNextPage={nextPage}
          onPreviousPage={previousPage}
          onFirstPage={firstPage}
          onLastPage={() => lastPage(total)}
          onPageChange={() => {
            clearSelection();
          }}
          limit={limit}
          offset={getOffset()}
          total={total}
        />
      )}
      <Outlet />
    </div>
  );
}

Component.displayName = 'RecordingsView';
