import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../backend/server.js';

function createFakeDatabase() {
  const records = new Map();
  let generatedId = 0;
  const snapshot = key => ({
    id: key.split('/').at(-1),
    exists: records.has(key),
    data: () => records.get(key)
  });
  const documentReference = key => ({
    id: key.split('/').at(-1),
    get: async () => snapshot(key),
    set: async (value, options = {}) => {
      records.set(key, options.merge ? { ...records.get(key), ...value } : value);
    },
    delete: async () => { records.delete(key); },
    collection: name => collectionReference(`${key}/${name}`)
  });
  const collectionReference = path => {
    let orderField = null;
    let direction = 'asc';
    let maximum = Infinity;
    let startAfterId = null;
    const result = {
      doc: id => documentReference(`${path}/${id || `forum-${++generatedId}`}`),
      orderBy: (field, order) => {
        orderField = field;
        direction = order;
        return result;
      },
      limit: value => {
        maximum = value;
        return result;
      },
      startAfter: cursorSnapshot => {
        startAfterId = cursorSnapshot.id;
        return result;
      },
      get: async () => {
        const depth = path.split('/').length + 1;
        let documents = [...records.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && key.split('/').length === depth)
          .map(([key, data]) => ({ id: key.split('/').at(-1), data: () => data }));
        if (orderField) {
          documents.sort((left, right) => {
            const difference = Number(left.data()[orderField]) - Number(right.data()[orderField]);
            return direction === 'desc' ? -difference : difference;
          });
        }
        const startIndex = startAfterId
          ? documents.findIndex(document => document.id === startAfterId) + 1
          : 0;
        return { docs: documents.slice(startIndex, startIndex + maximum) };
      }
    };
    return result;
  };
  return {
    db: { collection: collectionReference },
    records
  };
}

let server;
let origin;
let database;
const previousAdmin = app.locals.firebaseAdmin;

before(async () => {
  database = createFakeDatabase();
  app.locals.firebaseAdmin = {
    auth: {
      verifyIdToken: async token => {
        if (token === 'author-token') return { uid: 'author-1', name: 'Alex Author' };
        if (token === 'reader-token') return { uid: 'reader-2', name: 'Sam Reader' };
        throw new Error('Invalid test token');
      }
    },
    db: database.db
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (previousAdmin) app.locals.firebaseAdmin = previousAdmin;
  else delete app.locals.firebaseAdmin;
});

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return {
    response,
    data: response.status === 204 ? null : await response.json()
  };
}

test('public community feed and authenticated post, rating, and comment ownership work', async () => {
  const anonymousCreate = await request('/api/forum/posts', {
    method: 'POST',
    body: { type: 'review', title: 'Helpful tool', content: 'This tool helped me write a resume.', rating: 5 }
  });
  assert.equal(anonymousCreate.response.status, 401);

  const invalidRating = await request('/api/forum/posts', {
    method: 'POST',
    token: 'author-token',
    body: { type: 'review', title: 'Helpful tool', content: 'This tool helped me write a resume.', rating: 6 }
  });
  assert.equal(invalidRating.response.status, 400);

  const review = await request('/api/forum/posts', {
    method: 'POST',
    token: 'author-token',
    body: {
      type: 'review',
      title: 'A helpful resume builder',
      content: 'The editor made it easy to organize my experience.',
      rating: 5
    }
  });
  assert.equal(review.response.status, 201);
  assert.equal(review.data.post.authorName, 'Alex Author');
  assert.equal(review.data.post.rating, 5);
  const reviewId = review.data.post.id;

  const discussion = await request('/api/forum/posts', {
    method: 'POST',
    token: 'reader-token',
    body: { type: 'discussion', title: 'Template question', content: 'Which template do you use for tech roles?' }
  });
  assert.equal(discussion.response.status, 201);
  const discussionId = discussion.data.post.id;

  const feed = await request('/api/forum/posts');
  assert.equal(feed.response.status, 200);
  assert.equal(feed.response.headers.get('cache-control'), 'no-store');
  assert.equal(feed.data.posts.length, 2);
  assert.equal(feed.data.ratingSummary.count, 1);
  assert.equal(feed.data.ratingSummary.average, 5);
  assert.equal(feed.data.posts.every(post => !Object.hasOwn(post, 'authorUid')), true);
  assert.equal(feed.data.posts.some(post => post.isOwner), false);
  const authorFeed = await request('/api/forum/posts', { token: 'author-token' });
  assert.equal(authorFeed.data.posts.find(post => post.id === reviewId).isOwner, true);

  const forbiddenEdit = await request(`/api/forum/posts/${reviewId}`, {
    method: 'PATCH',
    token: 'reader-token',
    body: { title: 'Changed title', content: 'This should not be allowed for another author.', rating: 2 }
  });
  assert.equal(forbiddenEdit.response.status, 403);

  const commentWithoutAuth = await request(`/api/forum/posts/${reviewId}/comments`, {
    method: 'POST',
    body: { content: 'I agree with this review.' }
  });
  assert.equal(commentWithoutAuth.response.status, 401);

  const comment = await request(`/api/forum/posts/${reviewId}/comments`, {
    method: 'POST',
    token: 'reader-token',
    body: { content: 'I agree with this review.' }
  });
  assert.equal(comment.response.status, 201);
  assert.equal(comment.data.comment.authorName, 'Sam Reader');
  assert.equal(comment.data.comment.isOwner, true);

  const publicComments = await request(`/api/forum/posts/${reviewId}/comments`);
  assert.equal(publicComments.response.status, 200);
  assert.equal(publicComments.data.comments.length, 1);
  assert.equal(publicComments.data.comments[0].isOwner, false);
  const readerComments = await request(`/api/forum/posts/${reviewId}/comments`, { token: 'reader-token' });
  assert.equal(readerComments.data.comments[0].isOwner, true);

  const forbiddenDeleteComment = await request(
    `/api/forum/posts/${reviewId}/comments/${comment.data.comment.id}`,
    { method: 'DELETE', token: 'author-token' }
  );
  assert.equal(forbiddenDeleteComment.response.status, 403);

  const edit = await request(`/api/forum/posts/${reviewId}`, {
    method: 'PATCH',
    token: 'author-token',
    body: {
      title: 'Updated review title',
      content: 'The editor helped me organize my experience and improve my resume.',
      rating: 4
    }
  });
  assert.equal(edit.response.status, 200);
  assert.equal(edit.data.post.rating, 4);

  const removeComment = await request(
    `/api/forum/posts/${reviewId}/comments/${comment.data.comment.id}`,
    { method: 'DELETE', token: 'reader-token' }
  );
  assert.equal(removeComment.response.status, 204);

  const deleteDiscussion = await request(`/api/forum/posts/${discussionId}`, {
    method: 'DELETE',
    token: 'reader-token'
  });
  assert.equal(deleteDiscussion.response.status, 204);
  const remainingFeed = await request('/api/forum/posts');
  assert.equal(remainingFeed.data.posts.length, 1);
  assert.equal(remainingFeed.data.ratingSummary.average, 4);

  const finalComment = await request(`/api/forum/posts/${reviewId}/comments`, {
    method: 'POST',
    token: 'author-token',
    body: { content: 'One last note before removing this review.' }
  });
  assert.equal(finalComment.response.status, 201);
  const deleteReview = await request(`/api/forum/posts/${reviewId}`, {
    method: 'DELETE',
    token: 'author-token'
  });
  assert.equal(deleteReview.response.status, 204);
  assert.equal(database.records.has(`forumPosts/${reviewId}/comments/${finalComment.data.comment.id}`), false);
  const emptyFeed = await request('/api/forum/posts');
  assert.equal(emptyFeed.data.posts.length, 0);
  assert.equal(emptyFeed.data.ratingSummary.average, null);

  for (let index = 0; index < 52; index += 1) {
    database.records.set(`forumPosts/seed-${index}`, {
      type: 'discussion',
      title: `Seeded topic ${index}`,
      content: 'A seeded discussion used to verify public feed pagination.',
      authorUid: 'seed-user',
      authorName: 'Seed User',
      createdAt: index,
      updatedAt: index
    });
  }
  const firstPage = await request('/api/forum/posts');
  assert.equal(firstPage.data.posts.length, 50);
  assert.ok(firstPage.data.nextCursor);
  const secondPage = await request(`/api/forum/posts?cursor=${encodeURIComponent(firstPage.data.nextCursor)}`);
  assert.equal(secondPage.data.posts.length, 2);
  assert.equal(new Set([...firstPage.data.posts, ...secondPage.data.posts].map(post => post.id)).size, 52);

  database.records.set('forumPosts/comment-pagination', {
    type: 'discussion',
    title: 'Comment pagination',
    content: 'A seeded topic used to verify comments are all publicly accessible.',
    authorUid: 'seed-user',
    authorName: 'Seed User',
    createdAt: 1000,
    updatedAt: 1000
  });
  for (let index = 0; index < 101; index += 1) {
    database.records.set(`forumPosts/comment-pagination/comments/comment-${index}`, {
      content: `Seed comment ${index}`,
      authorUid: 'seed-user',
      authorName: 'Seed User',
      createdAt: index
    });
  }
  const firstCommentPage = await request('/api/forum/posts/comment-pagination/comments');
  assert.equal(firstCommentPage.data.comments.length, 100);
  assert.ok(firstCommentPage.data.nextCursor);
  const secondCommentPage = await request(
    `/api/forum/posts/comment-pagination/comments?cursor=${encodeURIComponent(firstCommentPage.data.nextCursor)}`
  );
  assert.equal(secondCommentPage.data.comments.length, 1);
});
