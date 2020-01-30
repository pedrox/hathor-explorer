/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import ReactLoading from 'react-loading';
import { Link } from 'react-router-dom';
import {TX_COUNT} from '../constants';
import TxRow from './TxRow';
import helpers from '../utils/helpers';
import WebSocketHandler from '../WebSocketHandler';
import colors from '../index.scss';
import { isEqual } from 'lodash';


/**
 * Displays transactions history in a table with pagination buttons. As the user navigates through the history,
 * the URL parameters 'ts', 'hash' and 'page' are updated.
 *
 * Either all URL parameters are set or they are all missing.
 *
 * Example 1:
 *   hash = "00000000001b328fafb336b4515bb9557733fe93cf685dfd0c77cae3131f3fff"
 *   ts = "1579637190"
 *   page = "previous"
 *
 * Example 2:
 *   hash = "00000000001b328fafb336b4515bb9557733fe93cf685dfd0c77cae3131f3fff"
 *   ts = "1579637190"
 *   page = "next"
 */
class Transactions extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      transactions: [],
      firstHash: null,
      firstTimestamp: null,
      lastHash: null,
      lastTimestamp: null,
      loading: true,
      hasAfter: false,
      hasBefore: false,
      queryParams: this.obtainQueryParams(),
      error: null,
    }
  }

  componentDidMount() {
    this.getData(this.state.queryParams);

    WebSocketHandler.on('network', this.handleWebsocket);
  }

  componentDidUpdate(prevProps, prevState) {
    const queryParams = this.obtainQueryParams();
    const justErrored = this.state.error && !prevState.error;
    const skipGetData = this.state.loading || justErrored;

    // Do we have new URL params?
    if (!skipGetData && !isEqual(this.state.queryParams, queryParams)) {
      // Fetch new data, unless query params were cleared and we were already in the most recent page
      if (queryParams.hash || this.state.hasBefore) {
        console.log("will call getData()");
        this.setState({ loading: true, error: null });
        this.getData(queryParams);
      }
    }
  }

  componentWillUnmount() {
    WebSocketHandler.removeListener('network', this.handleWebsocket);
  }

  handleWebsocket = (wsData) => {
    if (wsData.type === 'network:new_tx_accepted') {
      this.updateListWs(wsData);
    }
  }

  updateListWs = (tx) => {
    // We only add new tx/blocks if it's the first page
    if (!this.state.hasBefore) {
      if (this.props.shouldUpdateList(tx)) {
        let transactions = this.state.transactions;
        let hasAfter = (this.state.hasAfter || (transactions.length === TX_COUNT && !this.state.hasAfter))
        transactions = helpers.updateListWs(transactions, tx, TX_COUNT);

        let firstHash = transactions[0].tx_id;
        let firstTimestamp = transactions[0].timestamp;
        let lastHash = transactions[transactions.length-1].tx_id;
        let lastTimestamp = transactions[transactions.length-1].timestamp;

        // Finally we update the state again
        this.setState({ transactions, hasAfter, firstHash, lastHash, firstTimestamp, lastTimestamp });
      }
    }
  }

  handleDataFetched = (data, queryParams) => {
    // Handle differently if is the first GET response we receive
    // page indicates if was clicked 'previous' or 'next'
    // Set first and last hash of the transactions
    let firstHash = null;
    let lastHash = null;
    let firstTimestamp = null;
    let lastTimestamp = null;
    if (data.transactions.length) {
      firstHash = data.transactions[0].tx_id;
      lastHash = data.transactions[data.transactions.length-1].tx_id;
      firstTimestamp = data.transactions[0].timestamp;
      lastTimestamp = data.transactions[data.transactions.length-1].timestamp;
    }

    let hasAfter;
    let hasBefore;
    if (queryParams.page === 'previous') {
      hasAfter = true;
      hasBefore = data.has_more;
      if (!hasBefore) {
        // Went back to most recent page: clear URL params
        this.clearQueryParams();
      }
    } else if (queryParams.page === 'next') {
      hasBefore = true;
      hasAfter = data.has_more;
    } else {
      // First load without parameters
      hasBefore = false;
      hasAfter = data.has_more;
    }

    this.setState({
      transactions: data.transactions,
      loading: false,
      firstHash,
      lastHash,
      firstTimestamp,
      lastTimestamp,
      hasAfter,
      hasBefore,
      queryParams,
    });
  }

  getData(queryParams) {
    this.props.updateData(queryParams.timestamp, queryParams.hash, queryParams.page).then((data) => {

      // FIXME: remove this code. Just for testing
      if (Math.random() < 0.5) {
        return Promise.reject('simulated error!');
      } else {
        // simulated delay
        return new Promise(function(resolve) {
          window.setTimeout(resolve, 300, data);
        });
      }
    }).then((data) => {
      // FIXME: remove this code. Just for testing

      this.handleDataFetched(data, queryParams);
    }, (e) => {
      // Error in request
      console.log(e);
      this.setState({ loading: false, error: e });
    });
  }

  obtainQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      timestamp: params.get('ts'),
      hash: params.get('hash'),
      page: params.get('page'),
    };
  }

  clearQueryParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('ts');
    url.searchParams.delete('hash');
    url.searchParams.delete('page');
    window.history.replaceState({}, '', url.href);
  }

  paginationUrl(ts, hash, page) {
    const url = new URL(window.location.href);
    url.searchParams.set('ts', ts);
    url.searchParams.set('hash', hash);
    url.searchParams.set('page', page);
    return url.pathname + url.search + url.hash;
  }

  render() {
    const loadPagination = () => {
      if (this.state.transactions.length === 0) {
        return null;
      } else {
        return (
          <nav aria-label="Tx pagination" className="d-flex justify-content-center">
            <ul className="pagination">
              <li ref="txPrevious" className={(!this.state.hasBefore || this.state.transactions.length === 0 || this.state.loading) ? "page-item mr-3 disabled" : "page-item mr-3"}>
                <Link className="page-link" to={this.paginationUrl(this.state.firstTimestamp, this.state.firstHash, 'previous')}>Previous</Link>
              </li>
              <li ref="txNext" className={(!this.state.hasAfter || this.state.transactions.length === 0 || this.state.loading) ? "page-item disabled" : "page-item"}>
                <Link className="page-link" to={this.paginationUrl(this.state.lastTimestamp, this.state.lastHash, 'next')}>Next</Link>
              </li>
            </ul>
          </nav>
        );
      }
    }

    const loadTable = () => {
      return (
        <div className="table-responsive mt-5">
          <table className="table table-striped" id="tx-table">
            <thead>
              <tr>
                <th className="d-none d-lg-table-cell">Hash</th>
                <th className="d-none d-lg-table-cell">Timestamp</th>
                <th className="d-table-cell d-lg-none" colSpan="2">Hash<br/>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loadTableBody()}
            </tbody>
          </table>
        </div>
      );
    }

    const loadTableBody = () => {
      return this.state.transactions.map((tx, idx) => {
        return (
          <TxRow key={tx.tx_id} tx={tx} />
        );
      });
    }

    return (
      <div className="w-100">
        {this.props.title}
        <div className="ajax-feedback">
          {this.state.loading && <ReactLoading type='spin' color={colors.purpleHathor} delay={0} width={30} height={30} />}
          {this.state.error && <span className="text-danger">An error has occurred. Please try again in a moment. [{this.state.error}]</span>}
        </div>
        {loadTable()}
        {loadPagination()}
      </div>
    );
  }
}

export default Transactions;
