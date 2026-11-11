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
import { formatBytes, totalBytes } from '@/utils/storage';
import { useEffect, useMemo, useState } from 'react';

import Button from '@/components/common/button/Button';
import Checkbox from '@/components/common/checkbox/Checkbox';
import ClashNotice from '@/components/clash/ClashNotice';
import DeleteConfirmationModal from '@/components/common/deleteConfirmationModal/DeleteConfirmationModal';
import Dropdown from '@/components/common/dropdown/Dropdown';
import EmptyState from '@/components/common/emptyState/EmptyState';
import KeepMp4Option from '@/components/recordings/keep/KeepMp4Option';
import { LargeArrowLeftIcon } from '@/assets';
import PaginationControls from '@/components/common/paginationControls/PaginationControls';
import Player from '@/components/player/Player';
import RecordingListItem from '@/components/recordings/listItem/RecordingListItem';
import StorageBar from '@/components/storage/StorageBar';
import { TestIds } from '@/__test__/ids';
import { c } from '@/utils/classNames';
import { downloadRecording } from '@/utils/download';
import styles from './RecordingsView.module.scss';
import { useClashes } from '@/hooks/clashes';
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
  const selectedIds = useMemo(
    () => new Set([...selectedRecordings].map((r) => r.id)),
    [selectedRecordings]
  );
  // the recording playing in the player (started from a thumbnail)
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [confirmationModalVisible, setConfirmationModalVisible] =
    useState<boolean>(false);
  const [keepMp4, setKeepMp4] = useState(false);

  const { limit, nextPage, previousPage, getOffset, firstPage, lastPage } =
    usePagination(defaultLimit, queryParams, setQueryParams);

  const { stopAndCancelRecordings, removeRecordings, pending } =
    useManageRecordings();

  const getStatus = () =>
    (queryParams.get('status') as RecordingStatus) || 'finished';
  // only looked up on the Upcoming list
  const clashes = useClashes(null, getStatus() === 'upcoming');

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
          : entries // the shows page: select-all means every recording
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
  const playHandler = (recording: Recording) =>
    recording.status === 'completed' ? () => setPlaying(recording) : undefined;

  // MP4 files, one after another (an MP4 is made first if there is none yet)
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const downloadSelected = async () => {
    const list = [...selectedRecordings].filter(
      (rec) => rec.status === 'completed'
    );
    for (const [i, rec] of list.entries()) {
      const label = `${i + 1}/${list.length}`;
      await downloadRecording(rec, (percent) =>
        setDownloadNote(
          percent === null
            ? null
            : t('download_preparing', { title: rec.title, progress: percent })
        )
      );
      if (list.length > 1 && i < list.length - 1) {
        setDownloadNote(`${t('download')} ${label}`);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    setDownloadNote(null);
  };
  const canDownload =
    getStatus() === 'finished' &&
    [...selectedRecordings].some((rec) => rec.status === 'completed');

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
    if (getStatus() === 'upcoming') {
      return t('confirm_cancel_recordings');
    }
    const list = [...selectedRecordings];
    const size = totalBytes(list);
    const keptCount = list.filter((r) => r.kept).length;
    const title = t('confirm_delete_selected', {
      count: list.length,
      size: size > 0 ? ` (${formatBytes(size)})` : '',
    });
    return keptCount > 0
      ? `${title} ${t('confirm_delete_kept_note', { count: keptCount })}`
      : title;
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
              selected={show.episodes.every((e) => selectedIds.has(e.id))}
              partial={
                !show.episodes.every((e) => selectedIds.has(e.id)) &&
                show.episodes.some((e) => selectedIds.has(e.id))
              }
              onSelection={(checked) =>
                setSelectedRecordings((prv) => {
                  const ids = new Set(show.episodes.map((e) => e.id));
                  const rest = [...prv].filter((v) => !ids.has(v.id));
                  return new Set(checked ? [...rest, ...show.episodes] : rest);
                })
              }
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
              onPlay={playHandler(recording)}
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
        onPlay={playHandler(recording)}
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

    removeRecordings(
      [...selectedRecordings].map((rec) => rec.id),
      keepMp4
    ).then((removed) => {
      if (!removed) {
        return; // e.g. no MP4 copy to keep: nothing was deleted, keep the dialog and selection
      }
      clearSelection();
      setKeepMp4(false);
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
      >
        {getStatus() !== 'upcoming' &&
          [...selectedRecordings].some((r) => !r.kept) && (
            <KeepMp4Option checked={keepMp4} onChange={setKeepMp4} />
          )}
      </DeleteConfirmationModal>

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
            className={styles.desktopOnly}
            quiet
            onClick={() =>
              navigate('/dvr/recordings/create', {
                preventScrollReset: true,
              })
            }
          />
          <Button
            label={t('create_recording_short')}
            style="blue"
            className={styles.mobileOnly}
            quiet
            onClick={() =>
              navigate('/dvr/recordings/create', {
                preventScrollReset: true,
              })
            }
          />
        </div>

        <div className={styles.actions}>
          {canDownload && (
            <Button
              label={t('download')}
              onClick={downloadSelected}
              quiet
              testID={TestIds.DOWNLOAD_RECORDINGS_BUTTON}
            />
          )}
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

      {getStatus() === 'upcoming' && <ClashNotice clashes={clashes} />}
      {grouped && !currentShow && <StorageBar />}
      {grouped && currentShow && (
        <h2 className={styles.showTitle}>
          {currentShow.title}
          <span className={styles.showSize}>
            {` · ${t('episodes_count', { count: currentShow.episodes.length })} · ${formatBytes(totalBytes(currentShow.episodes))}`}
          </span>
        </h2>
      )}
      {downloadNote && <p className={styles.note}>{downloadNote}</p>}
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
      {playing && (
        <Player
          visible
          onClose={() => setPlaying(null)}
          title={playing.title}
          recordingId={playing.id}
        />
      )}
      <Outlet />
    </div>
  );
}

Component.displayName = 'RecordingsView';
